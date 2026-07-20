/**
 * Decodes HTML entities commonly found in RSS feeds.
 * @param {string} str 
 * @returns {string}
 */
function decodeHtmlEntities(str) {
  if (!str) return '';
  return str
    .replace(/&#038;/g, '&')
    .replace(/&#8216;/g, "'")
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;/g, '"')
    .replace(/&#8221;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .trim();
}

/**
 * Fetch new updates from What's on Netflix RSS feed.
 * @returns {Promise<Array<object>>}
 */
async function fetchNetflixFeed() {
  try {
    const url = 'https://www.whats-on-netflix.com/feed/';
    console.log(`[Netflix] Fetching feed: ${url}`);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const xml = await response.text();
    const items = [];

    // Find all <item> blocks
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemContent = match[1];
      
      const rawTitle = itemContent.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || '';
      const rawLink = itemContent.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '';
      const rawPubDate = itemContent.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '';
      const mediaContent = itemContent.match(/<media:content[^>]*url="([^"]+)"/i)?.[1] || '';
      const description = itemContent.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '';

      const title = decodeHtmlEntities(rawTitle);
      const url = decodeHtmlEntities(rawLink);
      const pubDate = decodeHtmlEntities(rawPubDate);
      const desc = decodeHtmlEntities(description).replace(/<[^>]+>/g, '').substring(0, 200) + '...';

      if (title && url) {
        items.push({
          id: url, // Use URL as the unique ID for deduplication
          title,
          url,
          image: mediaContent || null,
          info: `Published: ${new Date(pubDate).toLocaleDateString()}`,
          description: desc,
          source: 'Netflix'
        });
      }
    }

    console.log(`[Netflix] Successfully parsed ${items.length} items from feed.`);
    return items;
  } catch (err) {
    console.error('[Netflix] Error fetching/parsing feed:', err.message);
    return [];
  }
}

module.exports = { fetchNetflixFeed };
