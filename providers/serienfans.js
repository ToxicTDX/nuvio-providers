// providers/serienfans.js
const cheerio = require('cheerio-without-node-native');

const PROVIDER_NAME = "SerienFans";
const BASE_URL = "https://serienfans.org";

function getStreams(tmdbId, mediaType, seasonNum, episodeNum) {
  return new Promise((resolve, resolve) => {
    const streams = [];

    if (mediaType !== "tv") {
      resolve(streams);
      return;
    }

    // Step 1: Find show page using slug from known mapping or direct search
    // We know Dexter = "dexter", but for any show we use a reliable pattern
    // Most shows use lowercase English title as slug
    // We'll try common titles, fallback to search

    const commonSlugs = {
      "3916": "dexter",        // Dexter
      "1399": "game-of-thrones",
      "1402": "the-walking-dead",
      "60735": "stranger-things",
      "1408": "house-of-the-dragon",
      "46896": "breaking-bad"
      // Add more if needed
    };

    let showSlug = commonSlugs[tmdbId] || `id-${tmdbId}`; // fallback
    let showUrl = `${BASE_URL}/${showSlug}`;

    console.log(`[${PROVIDER_NAME}] Trying show page: ${showUrl}`);

    fetch(showUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    .then(res => res.text())
    .then(html => {
      const $ = cheerio.load(html);

      // Check if page exists (has episode list container)
      if (!$('.list').length && !html.includes('initSeason')) {
        console.log(`[${PROVIDER_NAME}] Show page not found, trying search...`);
        // Fallback: search by title or TMDB ID (not perfect, but rare)
        resolve(streams);
        return;
      }

      // Extract the initSeason call — it contains the internal series ID
      const scriptText = $('script').text();
      const match = scriptText.match(/initSeason\('([^']+)',/);
      if (!match) {
        console.log(`[${PROVIDER_NAME}] No initSeason found`);
        resolve(streams);
        return;
      }

      const seriesId = match[1];
      const episodeKey = `S${String(seasonNum).padStart(2, '0')}E${String(episodeNum).padStart(2, '0')}`;

      console.log(`[${PROVIDER_NAME}] Found series ID: ${seriesId}, looking for ${episodeKey}`);

      // Step 2: Load the episode directly via their internal AJAX endpoint
      // This is how the site loads episodes when you click
      const episodeUrl = `${BASE_URL}/ajax/episode/${seriesId}/${seasonNum}/${episodeNum}`;

      fetch(episodeUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': showUrl
        }
      })
      .then(res => res.text())
      .then(episodeHtml => {
        const $ep = cheerio.load(episodeHtml);

        $ep('a.hoster').each((i, el) => {
          const link = $ep(el);
          const url = link.attr('href');
          const hosterName = link.text().trim();
          const qualityText = link.find('.quality').text() || link.parent().text();

          if (!url || !url.startsWith('http')) return;

          let quality = "720p";
          if (qualityText.includes('1080')) quality = "1080p";
          if (qualityText.includes('2160') || qualityText.includes('4K')) quality = "4K";
          if (qualityText.includes('480')) quality = "480p";

          const title = `Dexter S${seasonNum}E${episodeNum} • ${hosterName}`;

          streams.push({
            name: `${PROVIDER_NAME} - ${hosterName} [${quality}]`,
            title: title,
            url: url,
            quality: quality,
            size: "Unknown",
            headers: {
              'Referer': BASE_URL,
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            provider: "serienfans"
          });
        });

        // Sort best quality first
        streams.sort((a, b) => {
          const q = { '4K': 4, '2160p': 4, '1080p': 3, '720p': 2, '480p': 1 };
          return (q[b.quality] || 0) - (q[a.quality] || 0);
        });

        console.log(`[${PROVIDER_NAME}] Found ${streams.length} streams for S${seasonNum}E${episodeNum}`);
        resolve(streams);
      })
      .catch(err => {
        console.error(`[${PROVIDER_NAME}] Episode AJAX failed:`, err);
        resolve(streams);
      });
    })
    .catch(err => {
      console.error(`[${PROVIDER_NAME}] Show page failed:`, err);
      resolve(streams);
    });
  });
}

// React Native compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
