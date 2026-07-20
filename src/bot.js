const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { fetchRottenTomatoes } = require('./sources/rottentomatoes');
const { fetchNetflixFeed } = require('./sources/netflix');
const { buildEmbeds } = require('./discord');
const { loadHistory, isAlreadySent, markAsSent, isHistoryEmpty, saveHistory } = require('./history');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const FEED_LIMIT = parseInt(process.env.FEED_LIMIT || '8', 10);

// Default movie sources to scan (Netflix RSS, RT Prime, RT Disney, RT Recommendations)
const DEFAULT_SOURCES = 'netflix,prime,disney,recommendation';

let schedulerTimer = null;

/**
 * Helper to update the .env file with new schedule hour
 * @param {number} hours 
 */
function updateEnvSchedule(hours) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      if (content.match(/CHECK_INTERVAL_HOURS=\d+/)) {
        content = content.replace(/CHECK_INTERVAL_HOURS=\d+/, `CHECK_INTERVAL_HOURS=${hours}`);
      } else {
        content += `\nCHECK_INTERVAL_HOURS=${hours}`;
      }
      fs.writeFileSync(envPath, content, 'utf8');
    }
    process.env.CHECK_INTERVAL_HOURS = String(hours);
  } catch (err) {
    console.error('[Bot] Failed to update .env schedule:', err.message);
  }
}

/**
 * Helper to update the .env file with new command prefix
 * @param {string} prefix 
 */
function updateEnvPrefix(prefix) {
  try {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      if (content.match(/COMMAND_PREFIX=\S+/)) {
        content = content.replace(/COMMAND_PREFIX=\S+/, `COMMAND_PREFIX=${prefix}`);
      } else {
        content += `\nCOMMAND_PREFIX=${prefix}`;
      }
      fs.writeFileSync(envPath, content, 'utf8');
    }
    process.env.COMMAND_PREFIX = prefix;
  } catch (err) {
    console.error('[Bot] Failed to update .env prefix:', err.message);
  }
}

/**
 * Fetch feed items from a specific source identifier
 * @param {string} source 
 * @returns {Promise<Array<object>>}
 */
async function getFeedFromSource(source) {
  const clean = source.toLowerCase().trim();
  if (clean === 'rottentomatoes_top_rated' || clean === 'recommendation' || clean === 'recommendations') {
    return await fetchRottenTomatoes('top_rated');
  } else if (clean === 'rottentomatoes_popular' || clean === 'popular') {
    return await fetchRottenTomatoes('popular');
  } else if (clean === 'netflix_rt') {
    return await fetchRottenTomatoes('netflix');
  } else if (clean === 'prime' || clean === 'amazon_prime') {
    return await fetchRottenTomatoes('amazon_prime');
  } else if (clean === 'disney' || clean === 'disney_plus') {
    return await fetchRottenTomatoes('disney_plus');
  } else if (clean === 'netflix' || clean === 'netflix_rss') {
    return await fetchNetflixFeed();
  }
  return [];
}

/**
 * Fetch latest movies from all configured sources (with optional single-source filtering and round-robin mixing)
 */
async function fetchLatestMovies(limit, filterSource = null) {
  let allItems = [];
  let sources = [];

  if (filterSource) {
    // Map shortcut aliases to full keys
    let target = filterSource.toLowerCase().trim();
    if (target === 'recommendations') target = 'recommendation';
    if (target === 'disney_plus') target = 'disney';
    if (target === 'amazon_prime') target = 'prime';
    sources = [target];
  } else {
    sources = (process.env.MOVIE_SOURCES || DEFAULT_SOURCES)
      .split(',')
      .map(s => s.trim());
  }

  for (const source of sources) {
    if (!source) continue;
    const items = await getFeedFromSource(source);
    allItems = allItems.concat(items);
  }

  // If no specific filter source is requested, mix them in a round-robin format
  if (!filterSource && allItems.length > 0) {
    const grouped = {};
    allItems.forEach(item => {
      if (!grouped[item.source]) grouped[item.source] = [];
      grouped[item.source].push(item);
    });

    const combined = [];
    const sourceKeys = Object.keys(grouped);
    const maxLen = Math.max(...sourceKeys.map(k => grouped[k].length));

    for (let i = 0; i < maxLen; i++) {
      for (const key of sourceKeys) {
        if (grouped[key][i]) {
          combined.push(grouped[key][i]);
        }
      }
    }
    allItems = combined;
  }

  return allItems.slice(0, limit);
}

/**
 * Automated scheduled posting task (with history deduplication and round-robin mixing)
 */
async function runAutomatedPost(client) {
  console.log(`[Scheduler] Checking for updates at ${new Date().toISOString()}...`);
  
  if (!CHANNEL_ID) {
    console.warn('[Scheduler] Cannot run automated post: CHANNEL_ID is not configured.');
    return;
  }

  const channel = client.channels.cache.get(CHANNEL_ID);
  if (!channel) {
    console.error(`[Scheduler] Channel with ID "${CHANNEL_ID}" not found. Verify bot has access.`);
    return;
  }

  // Load history
  loadHistory();
  const isFirstRun = isHistoryEmpty();

  // Fetch items from all sources
  let allItems = [];
  const sources = (process.env.MOVIE_SOURCES || DEFAULT_SOURCES)
    .split(',')
    .map(s => s.trim());

  for (const source of sources) {
    if (!source) continue;
    const items = await getFeedFromSource(source);
    allItems = allItems.concat(items);
  }

  // Round-robin mix the retrieved feed list
  if (allItems.length > 0) {
    const grouped = {};
    allItems.forEach(item => {
      if (!grouped[item.source]) grouped[item.source] = [];
      grouped[item.source].push(item);
    });

    const combined = [];
    const sourceKeys = Object.keys(grouped);
    const maxLen = Math.max(...sourceKeys.map(k => grouped[k].length));

    for (let i = 0; i < maxLen; i++) {
      for (const key of sourceKeys) {
        if (grouped[key][i]) {
          combined.push(grouped[key][i]);
        }
      }
    }
    allItems = combined;
  }

  // Filter out duplicates
  const newItems = allItems.filter(item => !isAlreadySent(item.id));
  console.log(`[Scheduler] Found ${newItems.length} new items.`);

  if (newItems.length === 0) {
    console.log('[Scheduler] No new updates to post.');
    return;
  }

  const itemsToSend = newItems.slice(0, FEED_LIMIT);
  const embeds = buildEmbeds(itemsToSend);

  try {
    // Send embeds to the channel in chunks of 10
    const chunkSize = 10;
    for (let i = 0; i < embeds.length; i += chunkSize) {
      const chunk = embeds.slice(i, i + chunkSize);
      await channel.send({
        content: i === 0 ? '🎬 **Here are the latest automated movie updates!**' : undefined,
        embeds: chunk
      });
    }

    // Update history
    if (isFirstRun) {
      allItems.forEach(item => markAsSent(item.id));
    } else {
      itemsToSend.forEach(item => markAsSent(item.id));
    }
    saveHistory();
    console.log(`[Scheduler] Posted ${itemsToSend.length} items and updated history.`);
  } catch (err) {
    console.error('[Scheduler] Error posting to channel:', err.message);
  }
}

/**
 * Start or reschedule the automated poster loop
 */
function startScheduler(client) {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }

  const hours = parseFloat(process.env.CHECK_INTERVAL_HOURS || '4');
  const ms = hours * 60 * 60 * 1000;
  console.log(`[Scheduler] Automated posts scheduled every ${hours} hours.`);

  schedulerTimer = setInterval(() => {
    runAutomatedPost(client).catch(console.error);
  }, ms);
}

/**
 * Initialize and start the Discord Bot Client
 */
function startBot() {
  if (!TOKEN || TOKEN === 'YOUR_BOT_TOKEN_HERE') {
    console.error('ERROR: DISCORD_BOT_TOKEN is not set in .env! Please follow instructions to add a token.');
    return;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  // Start a basic HTTP server to bind to a port (required by Render's free Web Services)
  const http = require('http');
  const PORT = process.env.PORT || 8080;
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('TamhouseBot is online!');
  });
  server.listen(PORT, () => {
    console.log(`[Web Server] Listening on port ${PORT} (Render compatible)`);
  });

  // Handle client errors gracefully to prevent crashing
  client.on('error', err => {
    console.error('[Bot Client Error]', err);
  });

  client.once('ready', () => {
    const currentPrefix = process.env.COMMAND_PREFIX || 'mo!';
    console.log(`\n🤖 Bot is online! Logged in as ${client.user.tag}`);
    console.log(`Listening for commands starting with prefix: "${currentPrefix}"`);
    
    // Start automated scheduler
    startScheduler(client);
    
    // Run an initial post check shortly after boot (wait 5 seconds to settle)
    setTimeout(() => {
      runAutomatedPost(client).catch(console.error);
    }, 5000);
  });

  client.on('messageCreate', async (message) => {
    const currentPrefix = process.env.COMMAND_PREFIX || 'mo!';
    
    // Ignore bots and messages without prefix
    if (message.author.bot || !message.content.startsWith(currentPrefix)) return;

    const args = message.content.slice(currentPrefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. mo!help
    if (command === 'help') {
      const helpText = 
        `🎬 **Movie Feed Bot Commands**\n\n` +
        `• \`${currentPrefix}movies [source]\` — Displays current feeds. You can request a specific source: \`netflix\`, \`prime\`, \`disney\`, \`recommendation\`. Example: \`${currentPrefix}movies prime\`\n` +
        `• \`${currentPrefix}setschedule <hours>\` — Changes how often automated posts run (e.g. \`${currentPrefix}setschedule 2\`).\n` +
        `• \`${currentPrefix}setprefix <prefix>\` — Customizes the bot's command prefix (e.g. \`${currentPrefix}setprefix !\`).\n` +
        `• \`${currentPrefix}help\` — Shows this help message.`;
      return message.reply(helpText);
    }

    // 2. mo!movies
    if (command === 'movies') {
      const sourceQuery = args[0] ? args[0].toLowerCase().trim() : null;
      const displayLabel = sourceQuery ? `[${sourceQuery}]` : 'all';
      
      const statusMsg = await message.reply(`🔍 Fetching latest movie feeds from ${displayLabel}, please wait...`);
      try {
        const items = await fetchLatestMovies(FEED_LIMIT, sourceQuery);
        if (items.length === 0) {
          return statusMsg.edit(`❌ Failed to fetch any movies for source: ${sourceQuery || 'all'}. Please verify source name.`);
        }

        const embeds = buildEmbeds(items);
        await statusMsg.delete();

        // Send embeds in chunks of 10
        const chunkSize = 10;
        for (let i = 0; i < embeds.length; i += chunkSize) {
          const chunk = embeds.slice(i, i + chunkSize);
          await message.channel.send({
            content: i === 0 ? `🎬 **Here are the current top movie feeds (Requested by ${message.author}):**` : undefined,
            embeds: chunk
          });
        }
      } catch (err) {
        console.error('[Bot] Error handling movies command:', err.message);
        statusMsg.edit('❌ An error occurred while generating movie embeds.');
      }
    }

    // 3. mo!setschedule
    if (command === 'setschedule') {
      const hoursArg = args[0];
      const hours = parseFloat(hoursArg);

      if (isNaN(hours) || hours <= 0) {
        return message.reply(`❌ Invalid hours. Please supply a positive number. Example: \`${currentPrefix}setschedule 2\``);
      }

      if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ You must be an Administrator to change the schedule.');
      }

      try {
        // Update env
        updateEnvSchedule(hours);
        // Restart scheduler
        startScheduler(client);
        
        return message.reply(`✅ **Schedule updated!** Automated movie recaps will now post every **${hours}** hours. (Settings saved to .env)`);
      } catch (err) {
        console.error('[Bot] Error updating schedule:', err.message);
        return message.reply('❌ Failed to update scheduling config.');
      }
    }

    // 4. mo!setprefix
    if (command === 'setprefix') {
      const newPrefix = args[0];
      if (!newPrefix || newPrefix.length < 1 || newPrefix.length > 5 || newPrefix.includes(' ')) {
        return message.reply(`❌ Invalid prefix. It must be between 1 and 5 characters and cannot contain spaces. Example: \`${currentPrefix}setprefix mo!\``);
      }

      if (!message.member.permissions.has('Administrator')) {
        return message.reply('❌ You must be an Administrator to change the prefix.');
      }

      try {
        updateEnvPrefix(newPrefix);
        return message.reply(`✅ **Prefix updated!** Commands now use \`${newPrefix}\`. Example: \`${newPrefix}movies\``);
      } catch (err) {
        console.error('[Bot] Error setting prefix:', err.message);
        return message.reply('❌ Failed to update prefix config.');
      }
    }
  });

  client.login(TOKEN).catch(err => {
    console.error('Failed to log in to Discord. Check your BOT TOKEN in .env.');
    console.error(err.message);
  });
}

module.exports = { startBot };
