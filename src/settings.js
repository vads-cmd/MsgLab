'use strict';

const fs = require('node:fs/promises');

// The form controls whose value is remembered between runs (by element id).
// Seed and manual values are left out on purpose: they belong to one message.
const REMEMBERED_CONTROLS = new Set([
  'gen-type', 'gen-version', 'gen-send-app', 'gen-send-fac', 'gen-recv-app', 'gen-recv-fac',
  'gen-processing', 'gen-all-empty', 'manual-show-optional',
  'bulk-count', 'bulk-minutes', 'bulk-mode',
  'export-mode', 'export-batch', 'file-eol', 'file-encoding', 'file-mllp',
]);

const MAX_TEXT = 100;

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

/** The whole settings object, cleaned: { controls, folder }. */
function cleanSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const folder = typeof source.folder === 'string' && source.folder.length > 0 && source.folder.length < 1000 ? source.folder : null;
  return { controls: cleanControls(source.controls), folder };
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

module.exports = { REMEMBERED_CONTROLS, cleanSettings, loadSettings, saveSettings };
