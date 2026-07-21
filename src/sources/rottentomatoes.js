const cheerio = require('cheerio');

/**
 * Fetch movies from Rotten Tomatoes browse pages.
 * @param {string} type - 'top_rated', 'popular', 'netflix', 'prime', 'disney', 'hbo_max'
 * @returns {Promise<Array<object>>}
 */
async function fetchRottenTomatoes(type = 'top_rated') {
  try {
    let url;
    let label = 'Rotten Tomatoes';
    const cleanType = type.toLowerCase().trim();

    if (cleanType === 'netflix') {
      url = 'https://www.rottentomatoes.com/browse/movies_at_home/services:netflix';
      label = 'Rotten Tomatoes (Netflix)';
    } else if (cleanType === 'amazon_prime' || cleanType === 'prime') {
      url = 'https://www.rottentomatoes.com/browse/movies_at_home/services:amazon_prime';
      label = 'Rotten Tomatoes (Prime)';
    } else if (cleanType === 'disney_plus' || cleanType === 'disney') {
      url = 'https://www.rottentomatoes.com/browse/movies_at_home/services:disney_plus';
      label = 'Rotten Tomatoes (Disney+)';
    } else if (cleanType === 'hbo' || cleanType === 'hbo_max' || cleanType === 'hbomax' || cleanType === 'max') {
      url = 'https://www.rottentomatoes.com/browse/movies_at_home/services:hbo_max';
      label = 'Rotten Tomatoes (HBO Max)';
    } else if (cleanType === 'popular') {
      url = 'https://www.rottentomatoes.com/browse/movies_at_home/sort:popular';
      label = 'Rotten Tomatoes (Popular)';
    } else {
      url = 'https://www.rottentomatoes.com/browse/movies_at_home/sort:top_rated';
      label = 'Rotten Tomatoes (Recommended)';
    }
    
    console.log(`[Rotten Tomatoes] Fetching: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const movies = [];

    $('media-info-tile').each((idx, elem) => {
      const $tile = $(elem);
      
      const title = $tile.find('rt-text[data-qa="discovery-media-list-item-title"]').text().trim();
      const relativeUrl = $tile.find('poster-tile').attr('media-url') || $tile.find('a.js-tile-link').attr('href') || '';
      const url = relativeUrl ? `https://www.rottentomatoes.com${relativeUrl}` : '';
      let image = $tile.find('rt-img').attr('src') || '';
      if (image.includes('/v2/https://')) {
        image = image.substring(image.indexOf('/v2/https://') + 4);
      }
      const criticsScore = $tile.find('rt-text[slot="criticsScore"]').text().trim();
      const audienceScore = $tile.find('rt-text[slot="audienceScore"]').text().trim();
      const info = $tile.find('rt-text[data-qa="discovery-media-list-item-start-date"]').text().trim();

      if (title && url) {
        movies.push({
          id: url, // Use URL as the unique ID for deduplication
          title,
          url,
          image,
          criticsScore: criticsScore || 'N/A',
          audienceScore: audienceScore || 'N/A',
          info: info || 'N/A',
          source: label
        });
      }
    });

    console.log(`[Rotten Tomatoes] Successfully parsed ${movies.length} movies.`);
    return movies;
  } catch (err) {
    console.error('[Rotten Tomatoes] Error fetching/parsing:', err.message);
    return [];
  }
}

module.exports = { fetchRottenTomatoes };
