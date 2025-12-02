// providers/serienfans.js - Working Dec 2025 (Direct API, No Devtools Detection Issues)
const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME = "SerienFans";
const BASE_URL = "https://serienfans.org";

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': BASE_URL + '/dexter',  // Update per show
  'Origin': BASE_URL,
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin'
};

// Cached series IDs (from page source: initSeason('ID', ...))
const SERIES_IDS = {
  '3916': 'nZu48PrnjCHRaz2bPJYa24b2eeYvRKHM'  // Dexter (original 2006)
  // Add more: e.g., '1399': 'game-of-thrones-id' (fetch from show page)
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve) => {
    const streams = [];

    if (mediaType !== 'tv') {
      console.log(`[${PROVIDER_NAME}] Skipping non-TV`);
      return resolve(streams);
    }

    const seriesId = SERIES_IDS[tmdbId];
    if (!seriesId) {
      console.log(`[${PROVIDER_NAME}] No series ID for TMDB ${tmdbId} (add to SERIES_IDS)`);
      return resolve(streams);
    }

    const postData = new URLSearchParams({
      series_id: seriesId,
      season: seasonNum,
      episode: episodeNum,
      lang: 'DE',  // 'EN' for English dubs/subs
      quality: 'ALL'
    });

    const apiUrl = `${BASE_URL}/ajax/series/${seriesId}/episode`;
    console.log(`[${PROVIDER_NAME}] Fetching S${seasonNum}E${episodeNum} from ${apiUrl.substring(0, 50)}...`);

    fetch(apiUrl, {
      method: 'POST',
      headers: HEADERS,
      body: postData
    })
    .then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    })
    .then(html => {
      const $ = cheerio.load(html);

      // Parse hoster links (common classes/selectors for embeds)
      $('a.hoster, .stream-link a, a[href*="voe.sx"], a[href*="streamtape.com"], a[href*="dood.ws"], a[href*="mixdrop.co"]').each((i, el) => {
        const url = $(el).attr('href');
        if (!url || !url.startsWith('http')) return;

        // Detect hoster name
        const hoster = $(el).text().trim() || $(el).find('.hoster-name').text().trim() || 'Direct';

        // Detect quality from parent/attributes
        let quality = '720p';
        const qText = $(el).parent().text() + $(el).attr('title');
        if (qText.includes('1080') || qText.includes('FHD')) quality = '1080p';
        if (qText.includes('2160') || qText.includes('UHD') || qText.includes('4K')) quality = '4K';
        if (qText.includes('480') || qText.includes('SD')) quality = '480p';

        streams.push({
          name: `${PROVIDER_NAME} - ${hoster} [${quality}]`,
          title: `Dexter S${seasonNum}E${episodeNum} (2006)`,
          url: url,
          quality: quality,
          size: "Unknown",  // Parse from page if needed: $(el).next().text().match(/(\d+\.?\d*\s*[GM]B)/)?.[1]
          headers: { ...HEADERS, 'Referer': `${BASE_URL}/dexter` },
          provider: "serienfans"
        });
      });

      // Dedupe & sort (best quality first)
      const uniqueStreams = streams.filter((s, i, arr) => arr.findIndex(t => t.url === s.url) === i);
      const qOrder = { '4K': 4, '1080p': 3, '720p': 2, '480p': 1, 'Unknown': 0 };
      uniqueStreams.sort((a, b) => (qOrder[b.quality] || 0) - (qOrder[a.quality] || 0));

      console.log(`[${PROVIDER_NAME}] Found ${uniqueStreams.length} streams for S${seasonNum}E${episodeNum}`);
      resolve(uniqueStreams);
    })
    .catch(err => {
      console.error(`[${PROVIDER_NAME}] API error:`, err.message);
      resolve(streams);
    });
  });
}

// Nuvio export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
