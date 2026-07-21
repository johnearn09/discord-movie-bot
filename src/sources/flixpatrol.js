const cheerio = require('cheerio');

/**
 * Fetch Top 5 Movies and Top 5 Series from FlixPatrol via allorigins.win proxy
 * @param {string} platform - 'amazon-prime' or 'hbo-max'
 * @returns {Promise<Array<object>>}
 */
async function fetchFlixPatrol(platform) {
  try {
    const targetUrl = `https://flixpatrol.com/top10/${platform}/`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    console.log(`[FlixPatrol] Fetching via proxy: ${targetUrl}`);
    
    // Using native fetch instead of curl since the proxy runs on Vercel/Cloudflare Workers and bypasses blocks
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`Proxy HTTP error! status: ${response.status}`);
    }

    const html = await response.text();
    if (!html || html.length < 500) {
      throw new Error('Received empty or too short HTML response');
    }

    const $ = cheerio.load(html);
    const items = [];

    // Helper to parse a specific chart container
    const parseTable = (containerId, typeLabel) => {
      const container = $(`#${containerId}`);
      if (!container.length) {
        console.warn(`[FlixPatrol] Container #${containerId} not found`);
        return;
      }
      
      const rows = container.find('table.card-table tbody tr.table-group');
      // Limit to Top 5
      rows.slice(0, 5).each((idx, elem) => {
        const $row = $(elem);
        const rankText = $row.find('td.table-td').first().text().trim();
        const rank = rankText ? parseInt(rankText, 10) : (idx + 1);

        const $link = $row.find('td.table-td a').first();
        if (!$link.length) return;

        const titleText = $link.find('div').first().text().trim() || $link.text().trim();
        // Clean title
        const title = titleText.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
        
        const relativeLink = $link.attr('href') || '';
        const link = relativeLink ? `https://flixpatrol.com${relativeLink}` : targetUrl;

        let image = $row.find('img').first().attr('src') || '';
        if (image && !image.startsWith('http')) {
          image = `https://flixpatrol.com${image}`;
        }
        
        // Upgrade image quality from w72 to w350
        if (image && image.includes('/w72/')) {
          image = image.replace('/w72/', '/w350/');
        }

        items.push({
          id: `flixpatrol_${platform}_${typeLabel.toLowerCase()}_${title.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
          title: `#${rank} ${title} (${typeLabel})`,
          url: link,
          image: image || undefined,
          criticsScore: 'N/A',
          audienceScore: 'N/A',
          info: `FlixPatrol Daily Top 10 • ${typeLabel}`,
          description: `Currently ranked #${rank} in the Daily Top 10 ${typeLabel} charts on ${platform === 'amazon-prime' ? 'Amazon Prime' : 'HBO Max'}.`,
          source: platform === 'amazon-prime' ? 'Amazon Prime' : 'HBO Max'
        });
      });
    };

    // Parse Movies table
    parseTable(`toc-${platform}-movies`, 'Movie');
    // Parse Series table
    parseTable(`toc-${platform}-tv-shows`, 'Series');

    console.log(`[FlixPatrol] Successfully parsed ${items.length} items for ${platform}.`);
    return items;
  } catch (err) {
    console.error(`[FlixPatrol] Error fetching ${platform} feed:`, err.message);
    return [];
  }
}

module.exports = { fetchFlixPatrol };
