// providers/hdhub4u.js - Working with https://hdhub4u.rehab/ (Dec 2025)
const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME = "HDHub4u";
const BASE_URL = "https://hdhub4u.rehab";  // Current working domain
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Referer': BASE_URL + '/',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8'
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve) => {
    const streams = [];

    // Step 1: Get title/year from TMDB (reliable fallback)
    fetch(`https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=439c478a771f35c05022f9feabcca01c&language=en-US`)
      .then(r => r.json())
      .then(info => {
        const baseTitle = mediaType === 'tv' ? info.name : info.title;
        const year = (mediaType === 'tv' ? info.first_air_date : info.release_date)?.split('-')[0] || '';
        const query = mediaType === 'tv' && seasonNum
          ? `${baseTitle} Season ${seasonNum} ${year}`  // e.g., "Dexter Season 1 2006"
          : `${baseTitle} ${year}`;  // e.g., "Oppenheimer 2023"

        console.log(`[${PROVIDER_NAME}] Query: ${query}`);

        // Step 2: Search site
        return fetch(`${BASE_URL}/?s=${encodeURIComponent(query)}`, { headers: HEADERS })
          .then(r => r.text());
      })
      .then(html => {
        const $ = cheerio.load(html);

        // Step 3: Find best matching content page (prioritize quality/high-relevance links)
        let contentUrl = null;
        $('article .entry-header a, .movie-item a, h2 a, h3 a').each((i, el) => {
          const url = $(el).attr('href');
          const text = $(el).text().trim().toLowerCase();
          if (url && url.startsWith(BASE_URL) && 
              (text.includes('1080p') || text.includes('4k') || text.includes('web-dl') || 
               text.includes(query.toLowerCase().split(' ')[0]))) {  // Match title/quality
            contentUrl = url;
            return false;  // First good match
          }
        });

        if (!contentUrl) {
          console.log(`[${PROVIDER_NAME}] No matching page found`);
          return resolve([]);
        }

        console.log(`[${PROVIDER_NAME}] Content page: ${contentUrl}`);

        // Step 4: Fetch content page & extract streams
        return fetch(contentUrl, { headers: HEADERS })
          .then(r => r.text());
      })
      .then(html => {
        const $ = cheerio.load(html);

        // Extract download links (h3/h4 a tags with hosters/quality)
        $('h3 a, h4 a, .download-btn a, a[href*="hubcloud"], a[href*="pixeldrain"], a[href*="streamtape"], a[href*="hubdrive"]').each((i, el) => {
          let url = $(el).attr('href');
          if (!url || !url.startsWith('http')) return;

          // Handle relative URLs
          if (url.startsWith('/')) url = BASE_URL + url;

          // Detect quality from text/parent
          let quality = '720p';
          const fullText = $(el).text() + $(el).parent().text();
          if (fullText.includes('2160') || fullText.includes('4K') || fullText.includes('UHD')) quality = '4K';
          else if (fullText.includes('1080')) quality = '1080p';
          else if (fullText.includes('720')) quality = '720p';
          else if (fullText.includes('480')) quality = '480p';

          // Detect server
          let server = 'Direct';
          if (url.includes('hubcloud')) server = 'HubCloud';
          else if (url.includes('pixeldrain')) server = 'Pixeldrain';
          else if (url.includes('streamtape')) server = 'StreamTape';
          else if (url.includes('hubdrive')) server = 'HubDrive';

          // TV episode filter (if specified)
          if (mediaType === 'tv' && episodeNum) {
            const epText = fullText.toLowerCase();
            if (!epText.includes(`e${episodeNum}`) && !epText.includes(`episode ${episodeNum}`)) return;
          }

          streams.push({
            name: `${PROVIDER_NAME} - ${server} [${quality}]`,
            title: `${PROVIDER_NAME} • ${quality}`,  // Can enhance with TMDB title if needed
            url: url,
            quality: quality,
            size: "Unknown",  // Parse from page if visible (e.g., $(el).next().text())
            headers: HEADERS,
            provider: "hdhub4u"
          });
        });

        // Dedupe & sort (best quality first)
        const uniqueStreams = streams.filter((s, i, arr) => 
          arr.findIndex(t => t.url === s.url) === i
        );
        const qOrder = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
        uniqueStreams.sort((a, b) => (qOrder[b.quality] || 0) - (qOrder[a.quality] || 0));

        console.log(`[${PROVIDER_NAME}] Extracted ${uniqueStreams.length} streams`);
        resolve(uniqueStreams);
      })
      .catch(err => {
        console.error(`[${PROVIDER_NAME}] Fetch error:`, err.message);
        resolve([]);
      });
  });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
