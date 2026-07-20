const cheerio = require('cheerio');

/**
 * Fetch VMX/Vivamax original movies list from Wikipedia (List of VMX original programming)
 * @returns {Promise<Array<object>>}
 */
async function fetchVivamaxFeed() {
  try {
    const url = 'https://en.wikipedia.org/wiki/List_of_VMX_original_programming';
    console.log(`[Vivamax] Fetching: ${url}`);
    
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

    // Parse Year sections (e.g. 2024, 2025, 2026)
    $('h3, h4').each((idx, header) => {
      const text = $(header).text().trim();
      const match = text.match(/\b(202\d)\b/); // Matches years like 2024, 2025, 2026
      if (match) {
        const year = match[1];
        let next = $(header).next();
        
        // Find the next sibling table
        while (next.length && next[0].name !== 'table') {
          next = next.next();
        }
        
        if (next.length && next.hasClass('wikitable')) {
          next.find('tr').each((rIdx, tr) => {
            if (rIdx === 0) return; // Skip header row
            const tds = $(tr).find('td');
            if (tds.length >= 2) {
              const rawDate = $(tds[0]).text().trim();
              const title = $(tds[1]).text().trim();
              const relativeLink = $(tds[1]).find('a').attr('href') || '';
              const link = relativeLink ? `https://en.wikipedia.org${relativeLink}` : 'https://www.vivamax.net/';
              
              if (title && rawDate) {
                // Combine date and year
                const date = `${rawDate}, ${year}`;
                
                movies.push({
                  id: `vivamax_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                  title,
                  url: link,
                  image: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Vivamax_logo.png', // High-quality logo
                  criticsScore: 'N/A',
                  audienceScore: 'N/A',
                  info: `Released: ${date}`,
                  source: 'Vivamax'
                });
              }
            }
          });
        }
      }
    });

    // Reverse to show the latest ones first
    return movies.reverse();
  } catch (err) {
    console.error('[Vivamax] Error fetching feed:', err.message);
    return [];
  }
}

module.exports = { fetchVivamaxFeed };
