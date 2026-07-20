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

    // Parse Year sections (e.g. 2021 to 2026)
    $('h3, h4').each((idx, header) => {
      const text = $(header).text().trim();
      const match = text.match(/\b(202\d)\b/); // Matches years like 2024, 2025, 2026
      if (match) {
        const year = match[1];
        
        // Header might be wrapped inside a <div class="mw-heading"> on modern Wikipedia
        let topElem = $(header);
        if (topElem.parent().hasClass('mw-heading')) {
          topElem = topElem.parent();
        }

        // Find the next sibling table
        let next = topElem.next();
        while (next.length && next[0].name !== 'table') {
          next = next.next();
        }
        
        if (next.length && next.hasClass('wikitable')) {
          let currentMonth = 'January'; // Default fallback month for rowspans

          next.find('tr').each((rIdx, tr) => {
            if (rIdx === 0) return; // Skip header row
            
            const tds = $(tr).find('td');
            const th = $(tr).find('th');
            
            // If the row contains a <th> (excluding month span spacer), it has the month name
            if (th.length && th.attr('rowspan')) {
              const monthText = th.text().trim().replace(/[\r\n\s]+/g, '');
              if (monthText && monthText.length > 2) {
                // Convert "JANUARY" to "January"
                currentMonth = monthText.charAt(0).toUpperCase() + monthText.slice(1).toLowerCase();
              }
            }

            if (tds.length >= 2) {
              const day = $(tds[0]).text().trim();
              const title = $(tds[1]).text().trim();
              const relativeLink = $(tds[1]).find('a').attr('href') || '';
              const link = relativeLink ? `https://en.wikipedia.org${relativeLink}` : 'https://www.vivamax.net/';
              
              if (title && day) {
                const date = `${currentMonth} ${day}, ${year}`;
                
                movies.push({
                  id: `vivamax_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
                  title,
                  url: link,
                  image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/VMX_logo.svg/512px-VMX_logo.svg.png', // Clean VMX logo
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
