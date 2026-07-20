const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '..', 'sent_history.json');

let history = new Set();

/**
 * Load the sent history from sent_history.json
 */
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      const list = JSON.parse(data);
      history = new Set(list);
    } else {
      history = new Set();
    }
  } catch (err) {
    console.error('Error loading history file:', err);
    history = new Set();
  }
}

/**
 * Check if a movie ID/URL has already been sent
 * @param {string} id 
 * @returns {boolean}
 */
function isAlreadySent(id) {
  return history.has(id);
}

/**
 * Mark a movie ID/URL as sent
 * @param {string} id 
 */
function markAsSent(id) {
  history.add(id);
}

/**
 * Save the sent history to sent_history.json
 */
function saveHistory() {
  try {
    const list = Array.from(history);
    // Keep history size bounded if needed, but for movie feeds a few thousand items is tiny.
    // We can slice to keep the latest 5000 items if we want, but simple write is fine.
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving history file:', err);
  }
}

/**
 * Check if the history set is empty
 * @returns {boolean}
 */
function isHistoryEmpty() {
  return history.size === 0;
}

module.exports = {
  loadHistory,
  isAlreadySent,
  markAsSent,
  isHistoryEmpty,
  saveHistory
};
