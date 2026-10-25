'use strict';

const fs = require('node:fs/promises');

// The form controls whose value is remembered between runs (by element id).
// Seed and manual values are left out on purpose: they belong to one message.
const REMEMBERED_CONTROLS = new Set([
  'gen-type', 'gen-version', 'gen-send-app', 'gen-send-fac', 'gen-recv-app', 'gen-recv-fac',
  'gen-processing', 'gen-all-empty', 'manual-show-optional',
  'bulk-count', 'bulk-minutes', 'bulk-mode',
  'export-mode', 'export-batch', 'file-eol', 'file-encoding', 'file-mllp', 'app-theme',
  'send-host', 'send-port', 'send-connect-timeout', 'send-reply-timeout', 'send-encoding',
]);

// The colour themes the app can show; 'system' follows the operating system
const THEMES = new Set(['system', 'light', 'dark']);

const MAX_TEXT = 100;

// Folders the Save and Export dialogs start in: one for messages, one for bulk exports
const FOLDER_KINDS = new Set(['save', 'export']);

/** Keeps only known controls with a short text or true/false value; anything else in the file is dropped. */
function cleanControls(raw) {
  const controls = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return controls;
  for (const [id, value] of Object.entries(raw)) {
    const fine = typeof value === 'boolean' || (typeof value === 'string' && value.length <= MAX_TEXT);
    if (REMEMBERED_CONTROLS.has(id) && fine) controls[id] = value;
  }
  return controls;
}

/** The favourite message types: a list of short, plain type names (letters, digits, ^ and _), no repeats. */
function cleanFavorites(raw) {
  if (!Array.isArray(raw)) return [];
  const result = [];
  for (const value of raw) {
    if (typeof value === 'string' && /^[\w^.-]{1,40}$/.test(value) && !result.includes(value)) result.push(value);
    if (result.length >= 200) break;
  }
  return result;
}

/** The default folders: a short text for each kind, or null when not set. */
function cleanFolders(raw) {
  const folders = { save: null, export: null };
  if (!raw || typeof raw !== 'object') return folders;
  for (const kind of FOLDER_KINDS) {
    const value = raw[kind];
    if (typeof value === 'string' && value.length > 0 && value.length < 1000) folders[kind] = value;
  }
  return folders;
}

/** The whole settings object, cleaned: { controls, folder, folders, favorites }. */
function cleanSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const folder = typeof source.folder === 'string' && source.folder.length > 0 && source.folder.length < 1000 ? source.folder : null;
  return { controls: cleanControls(source.controls), folder, folders: cleanFolders(source.folders), favorites: cleanFavorites(source.favorites) };
}

/** Reads the settings file; a missing or damaged file gives empty settings. */
async function loadSettings(file) {
  try {
    return cleanSettings(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch {
    return cleanSettings(null);
  }
}

/** Writes the settings file (through a temporary file so a crash cannot leave half a file). */
async function saveSettings(file, settings) {
  const temp = `${file}.tmp`;
  await fs.writeFile(temp, JSON.stringify(cleanSettings(settings), null, 2), 'utf8');
  await fs.rename(temp, file);
}

module.exports = { REMEMBERED_CONTROLS, THEMES, FOLDER_KINDS, cleanFavorites, cleanSettings, loadSettings, saveSettings };
