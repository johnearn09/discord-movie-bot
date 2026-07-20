require('dotenv').config();
const { startBot } = require('./bot');
const { loadHistory, isAlreadySent, markAsSent, isHistoryEmpty, saveHistory } = require('./history');
const { fetchRottenTomatoes } = require('./sources/rottentomatoes');
const { fetchNetflixFeed } = require('./sources/netflix');
const { fetchVivamaxFeed } = require('./sources/vivamax');
const { fetchFlixPatrol } = require('./sources/flixpatrol');
const { sendToDiscord } = require('./discord');

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const FEED_LIMIT = parseInt(process.env.FEED_LIMIT || '8', 10);
const DEFAULT_SOURCES = 'netflix,prime,disney,recommendation,vivamax,hbo';

const SOURCES = (process.env.MOVIE_SOURCES || DEFAULT_SOURCES)
  .split(',')
  .map(s => s.trim().toLowerCase());
const INTERVAL_MS = parseInt(process.env.CHECK_INTERVAL_HOURS || '4', 10) * 60 * 60 * 1000;

/**
 * Fetch feed items from a specific source identifier (reused for Webhook fallback mode)
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
    return await fetchFlixPatrol('amazon-prime');
  } else if (clean === 'hbo' || clean === 'hbo_max' || clean === 'hbomax') {
    return await fetchFlixPatrol('hbo-max');
  } else if (clean === 'disney' || clean === 'disney_plus') {
    return await fetchRottenTomatoes('disney_plus');
  } else if (clean === 'netflix' || clean === 'netflix_rss') {
    return await fetchNetflixFeed();
  } else if (clean === 'vivamax' || clean === 'vmx') {
    return await fetchVivamaxFeed();
  }
  return [];
}

/**
 * Webhook Fallback runner (original logic upgraded with new sources)
 */
async function runWebhookMode() {
  console.log(`\n--- Webhook Run started at ${new Date().toISOString()} ---`);
  
  if (!WEBHOOK_URL) {
    console.error('ERROR: Neither DISCORD_BOT_TOKEN nor DISCORD_WEBHOOK_URL is configured. Please edit your .env file.');
    return;
  }

  loadHistory();
  const isFirstRun = isHistoryEmpty();
  if (isFirstRun) {
    console.log('[History] First run detected. Will initialize history with all currently available items to prevent back-filling older posts on future runs.');
  }

  let allItems = [];
  for (const source of SOURCES) {
    if (!source) continue;
    const items = await getFeedFromSource(source);
    allItems = allItems.concat(items);
  }

  const newItems = allItems.filter(item => !isAlreadySent(item.id));
  console.log(`Found ${newItems.length} new items not previously sent.`);

  if (newItems.length === 0) {
    console.log('No new updates to post. Finished.');
    return;
  }

  const itemsToSend = newItems.slice(0, FEED_LIMIT);
  console.log(`Limiting output to ${itemsToSend.length} items (Limit: ${FEED_LIMIT})`);

  const success = await sendToDiscord(itemsToSend, WEBHOOK_URL);

  if (success) {
    if (isFirstRun) {
      allItems.forEach(item => markAsSent(item.id));
      console.log(`[History] First-run: Marked all ${allItems.length} current feed items as sent.`);
    } else {
      itemsToSend.forEach(item => markAsSent(item.id));
    }
    saveHistory();
    console.log(`Successfully posted ${itemsToSend.length} items and updated history.`);
  } else {
    console.error('Failed to post items to Discord webhook. History not updated.');
  }

  console.log('--- Webhook Run completed ---\n');
}

/**
 * Main Orchestrator Boot Entry point
 */
function boot() {
  const hasBotToken = TOKEN && TOKEN !== 'YOUR_BOT_TOKEN_HERE' && TOKEN !== 'your_bot_token_here';
  
  if (hasBotToken) {
    console.log('[Orchestrator] Valid Discord Bot Token detected. Starting Discord Bot Mode......');
    startBot();
  } else {
    console.log('[Orchestrator] No valid Bot Token detected. Falling back to Discord Webhook Mode...');
    
    const isDaemon = process.argv.includes('--daemon');
    if (isDaemon) {
      console.log(`[Orchestrator] Starting Webhook in Daemon Mode (interval: ${process.env.CHECK_INTERVAL_HOURS || '4'} hours).`);
      runWebhookMode().catch(console.error);
      setInterval(() => {
        runWebhookMode().catch(console.error);
      }, INTERVAL_MS);
    } else {
      runWebhookMode()
        .then(() => process.exit(0))
        .catch(err => {
          console.error('[Orchestrator] Fatal error during Webhook run:', err);
          process.exit(1);
        });
    }
  }
}

boot();
