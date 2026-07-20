const cheerio = require('cheerio');

/**
 * Fetch VMX/Vivamax original movies list from TMDB
 * @returns {Promise<Array<object>>}
 */
async function fetchVivamaxFeed() {
  try {
    const url = 'https://www.themoviedb.org/company/149142-vivamax/movie';
    console.log(`[Vivamax] Fetching from TMDB: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const movies = [];

    // Find all media cards on the TMDB company movie list page
    $('div[class*="media-card"]').each((idx, elem) => {
      const $card = $(elem);
      
      // Get title
      const title = $card.find('h2').text().trim();
      
      // Get relative link and convert to absolute
      const relativeLink = $card.find('a[href^="/movie/"]').attr('href') || '';
      const link = relativeLink ? `https://www.themoviedb.org${relativeLink}` : 'https://www.themoviedb.org/company/149142-vivamax';
      
      // Get image poster
      let image = $card.find('img.poster').attr('src') || '';
      if (image) {
        // Upgrade image size for high quality poster
        image = image.replace('/w94_and_h141_face/', '/w500/');
      } else {
        image = 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/VMX_logo.svg/512px-VMX_logo.svg.png';
      }
      
      // Get release date
      const date = $card.find('.release_date').text().trim();
      
      // Get description
      const overview = $card.find('div.mt-4 p, p').first().text().trim();

      if (title && relativeLink) {
        movies.push({
          id: `vivamax_${relativeLink.replace('/movie/', '').replace(/\//g, '_')}`,
          title,
          url: link,
          image,
          criticsScore: 'N/A',
          audienceScore: 'N/A',
          info: `Released: ${date || 'N/A'}`,
          description: overview || '',
          source: 'Vivamax'
        });
      }
    });

    return movies;
  } catch (err) {
    console.error('[Vivamax] Error fetching feed from TMDB:', err.message);
    return [];
  }
}

module.exports = { fetchVivamaxFeed };
