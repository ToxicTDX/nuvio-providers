// providers/serienfans.js
const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME = "SerienFans";
const BASE_URL = "https://serienfans.org";

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': BASE_URL + '/',
  'Origin': BASE_URL,
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Cache-Control': 'max-age=0'
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve) => {
    const streams = [];

    if (mediaType !== 'tv') {
      resolve(streams);
      return;
    }

    // Slug mapping for known shows (expand as needed)
    const slugMap = {
      '3916': 'dexter'
      // Add e.g., '1399': 'game-of-thrones'
    };
    const showSlug = slugMap[tmdbId] || tmdbId.toLowerCase();
    const showUrl = `${BASE_URL}/${showSlug}`;

    console.log(`[${PROVIDER_NAME}] Fetching show: ${showUrl}`);

    fetch(showUrl, { headers: HEADERS })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(html => {
        const $ = cheerio.load(html);

        // Extract series ID from initSeason script
        const scriptMatch = html.match(/initSeason\('([a-zA-Z0-9]+)'/);
        if (!scriptMatch) {
          console.log(`[${PROVIDER_NAME}] No series ID found`);
          resolve(streams);
          return;
        }
        const seriesId = scriptMatch[1];

        // POST to episode API
        const episodeData = {
          series_id: seriesId,
          season: seasonNum,
          episode: episodeNum,
          lang: 'DE', // Or 'EN' for English
          quality: 'ALL'
        };

        const apiUrl = `${BASE_URL}/api/series/${seriesId}/episode`;
        console.log(`[${PROVIDER_NAME}] Fetching episode from: ${apiUrl}`);

        fetch(apiUrl, {
          method: 'POST',
          headers: {
            ...HEADERS,
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams(episodeData).toString()
        })
          .then(res => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.text();
          })
          .then(episodeHtml => {
            const $ep = cheerio.load(episodeHtml);

            // Parse hoster links (common classes: .hoster, a[href^=http] with quality)
            $ep('a.hoster, .stream-link a, a[href*="voe"], a[href*="mixdrop"], a[href*="dood"]').each((i, el) => {
              const url = $ep(el).attr('href');
              if (!url || !url.startsWith('http')) return;

              const hoster = $ep(el).text().trim() || 'Direct';
              let quality = '720p';
              const qText = $ep(el).parent().text();
              if (qText.includes('1080') || qText.includes('FHD')) quality = '1080p';
              if (qText.includes('2160') || qText.includes('UHD')) quality = '4K';
              if (qText.includes('480') || qText.includes('SD')) quality = '480p';

              streams.push({
                name: `${PROVIDER_NAME} - ${hoster} [${quality}]`,
                title: `Dexter S${seasonNum}E${episodeNum} (2006)`,
                url: url,
                quality: quality,
                size: 'Unknown',
                headers: { Referer: showUrl, ...HEADERS },
                provider: 'serienfans'
              });
            });

            // Dedupe and sort (best quality first)
            const uniqueStreams = streams.filter((s, i, arr) => arr.findIndex(t => t.url === s.url) === i);
            uniqueStreams.sort((a, b) => {
              const q = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1 };
              return (q[b.quality] || 0) - (q[a.quality] || 0);
            });

            console.log(`[${PROVIDER_NAME}] Found ${uniqueStreams.length} unique streams`);
            resolve(uniqueStreams);
          })
          .catch(err => {
            console.error(`[${PROVIDER_NAME}] Episode API error:`, err);
            resolve(streams);
          });
      })
      .catch(err => {
        console.error(`[${PROVIDER_NAME}] Show fetch error:`, err);
        resolve(streams);
      });
  });
}

// Export for Nuvio
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
