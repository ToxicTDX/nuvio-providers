// providers/hdrezka-fixed.js
const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME = "HDRezka";
const BASE_URL = "https://hdrezka.ag";
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Referer': BASE_URL,
  'Sec-Fetch-Mode': 'navigate'
};

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve) => {
    const streams = [];

    if (mediaType === 'tv' && (!seasonNum || !episodeNum)) {
      resolve(streams);
      return;
    }

    let searchUrl = `${BASE_URL}/ajax/search?keyw=${tmdbId}`;
    if (mediaType === 'tv') {
      searchUrl = `${BASE_URL}/series/${tmdbId}-${seasonNum}-${episodeNum}/watching.html`;
    } else {
      searchUrl = `${BASE_URL}/films/${tmdbId}/watching.html`;
    }

    console.log(`[${PROVIDER_NAME}] Fetching: ${searchUrl}`);

    fetch(searchUrl, { headers: HEADERS })
      .then(res => res.text())
      .then(html => {
        const $ = cheerio.load(html);

        // Extract translator IDs and qualities
        const translators = [];
        $('.translators .item').each((i, el) => {
          const id = $(el).data('id');
          const name = $(el).text().trim();
          if (id) translators.push({ id, name });
        });

        if (translators.length === 0) {
          console.log(`[${PROVIDER_NAME}] No translators found`);
          resolve(streams);
          return;
        }

        // For each translator, get streams (parallel-ish via chain)
        let count = 0;
        translators.forEach(trans => {
          const streamUrl = `${BASE_URL}/ajax/get_cdn_series/?translator_id=${trans.id}&title=${tmdbId}&season=${seasonNum}&episode=${episodeNum || 0}`;
          fetch(streamUrl, { headers: HEADERS })
            .then(res => res.text())
            .then(data => {
              const json = JSON.parse(data);
              if (json.ok && json.data) {
                json.data.forEach(item => {
                  if (item.file) {
                    let quality = '720p';
                    if (item.label.includes('1080')) quality = '1080p';
                    if (item.label.includes('4K')) quality = '4K';

                    streams.push({
                      name: `${PROVIDER_NAME} - ${trans.name} [${quality}]`,
                      title: `${mediaType.toUpperCase()} Title (${new Date().getFullYear()})`,
                      url: item.file,
                      quality: quality,
                      size: "Unknown",
                      headers: HEADERS,
                      provider: "hdrezka"
                    });
                  }
                });
              }
              count++;
              if (count === translators.length) {
                streams.sort((a, b) => {
                  const q = { '4K': 4, '1080p': 3, '720p': 2 };
                  return (q[b.quality] || 0) - (q[a.quality] || 0);
                });
                console.log(`[${PROVIDER_NAME}] Found ${streams.length} streams`);
                resolve(streams);
              }
            })
            .catch(() => { count++; if (count === translators.length) resolve(streams); });
        });
      })
      .catch(err => {
        console.error(`[${PROVIDER_NAME}] Error:`, err);
        resolve(streams);
      });
  });
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
