/**
 * Send movie updates to Discord Webhook.
 * Group embeds in chunks of up to 10 (Discord limit per request) to prevent rate limits.
 * @param {Array<object>} items - List of parsed movie/feed items
 * @param {string} webhookUrl - Discord Webhook URL
 * @returns {Promise<boolean>}
 */
/**
 * Build rich Discord embeds from movie items.
 * @param {Array<object>} items 
 * @returns {Array<object>}
 */
function buildEmbeds(items) {
  return items.map(item => {
    const isNetflix = item.source === 'Netflix';
    
    // Choose colors: Netflix red (#E50914 -> 15010068) or Rotten Tomatoes orange/red (#FA320A -> 16396810)
    const color = isNetflix ? 15010068 : 16396810;

    const embed = {
      title: item.title,
      url: item.url,
      color: color,
      footer: {
        text: `${item.source} • ${item.info}`
      }
    };

    // Add thumbnail if present
    if (item.image) {
      embed.thumbnail = { url: item.image };
    }

    // Add description / fields
    if (isNetflix) {
      embed.description = item.description || 'No description available.';
    } else {
      embed.fields = [
        {
          name: '🍅 Critics Score',
          value: item.criticsScore === 'N/A' ? 'N/A' : `**${item.criticsScore}**`,
          inline: true
        },
        {
          name: '🍿 Audience Score',
          value: item.audienceScore === 'N/A' ? 'N/A' : `**${item.audienceScore}**`,
          inline: true
        }
      ];
    }

    return embed;
  });
}

/**
 * Send movie updates to Discord Webhook.
 * Group embeds in chunks of up to 10 (Discord limit per request) to prevent rate limits.
 * @param {Array<object>} items - List of parsed movie/feed items
 * @param {string} webhookUrl - Discord Webhook URL
 * @returns {Promise<boolean>}
 */
async function sendToDiscord(items, webhookUrl) {
  if (!webhookUrl) {
    console.error('[Discord] Webhook URL is missing!');
    return false;
  }

  if (items.length === 0) {
    console.log('[Discord] No new items to send.');
    return true;
  }

  console.log(`[Discord] Preparing to send ${items.length} items to Discord...`);

  // Build the embeds list
  const embeds = buildEmbeds(items);

  // Split embeds into chunks of 10 (Discord limit per message)
  const chunkSize = 10;
  for (let i = 0; i < embeds.length; i += chunkSize) {
    const chunk = embeds.slice(i, i + chunkSize);
    
    try {
      console.log(`[Discord] Posting chunk of ${chunk.length} embeds...`);
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: i === 0 ? '🎬 **Here are the latest movie updates & ratings!**' : undefined,
          embeds: chunk
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Discord Webhook responded with status ${response.status}: ${errText}`);
      }

      console.log('[Discord] Chunk posted successfully.');
    } catch (err) {
      console.error('[Discord] Error posting to webhook:', err.message);
      return false;
    }

    // Add a slight delay between chunks to be safe with rate limits
    if (i + chunkSize < embeds.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  return true;
}

module.exports = { 
  sendToDiscord,
  buildEmbeds
};
