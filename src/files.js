'use strict';

/**
 * Preparing a message for a file: line endings, optional MLLP framing, encoding, file name.
 * No Electron in here, so everything can be tested on its own.
 */

const fs = require('node:fs/promises');
const nodePath = require('node:path');
const { parseMessage, splitMessages, get } = require('./hl7/parser');
const { patientLabel } = require('./hl7/bulk');
const { timestamp } = require('./hl7/generator');
const { messageTypeLabel } = require('./hl7/dictionary');

const LINE_ENDINGS = { cr: '\r', lf: '\n', crlf: '\r\n' };
const ENCODINGS = new Set(['utf-8', 'windows-1252']);
const MAX_BYTES = 50 * 1024 * 1024;

// MLLP: <VT> message <FS><CR>
const MLLP_START = '\x0b';
const MLLP_END = '\x1c\r';

// Windows-1252 differs from Latin-1 only in the range 0x80 to 0x9F
const WINDOWS_1252 = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87], ['ˆ', 0x88], ['‰', 0x89],
  ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e], ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95],
  ['–', 0x96], ['—', 0x97], ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);

/** Every line ends the same way, including the last one (the segment terminator); blank lines are dropped. */
function normalizeLineEndings(text, lineEnding) {
  const eol = LINE_ENDINGS[lineEnding];
  const lines = text.replaceAll(MLLP_START, '').replaceAll('\x1c', '').split(/\r\n|\r|\n/);
  return lines.filter((line) => line.trim() !== '').map((line) => line + eol).join('');
}

function encodeText(text, encoding) {
  if (encoding === 'utf-8') return Buffer.from(text, 'utf8');
  const bytes = [];
  for (const char of text) {
    const code = char.codePointAt(0);
    if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) bytes.push(code);
    else if (WINDOWS_1252.has(char)) bytes.push(WINDOWS_1252.get(char));
    else throw new Error(`The character "${char}" cannot be saved in Windows-1252. Choose UTF-8 instead.`);
  }
  return Buffer.from(bytes);
}

/** A note when the chosen encoding does not match what MSH-18 says. */
function charsetWarning(text, encoding) {
  const declared = get(parseMessage(text), 'MSH-18').toUpperCase();
  if (encoding === 'windows-1252' && declared.includes('UTF-8')) {
    return 'MSH-18 says UTF-8, but the file is saved as Windows-1252.';
  }
  return '';
}

/** The bytes to write: { data, warning }. */
function prepareFile(text, { lineEnding = 'cr', encoding = 'utf-8', mllp = false } = {}) {
  if (typeof text !== 'string') throw new TypeError('The message must be text.');
  if (!Object.hasOwn(LINE_ENDINGS, lineEnding)) throw new Error(`Unknown line ending: ${lineEnding}`);
  if (!ENCODINGS.has(encoding)) throw new Error(`Unknown encoding: ${encoding}`);
  const body = normalizeLineEndings(text, lineEnding);
  if (body === '') throw new Error('There is nothing to save.');
  const data = encodeText(mllp ? `${MLLP_START}${body}${MLLP_END}` : body, encoding);
  if (data.length > MAX_BYTES) throw new Error('The message is too large to save.');
  return { data, warning: charsetWarning(text, encoding) };
}

/** "ADT_A01_MSG0001.hl7" from the message type and control ID. */
function suggestFileName(text) {
  const msg = parseMessage(typeof text === 'string' ? text : '');
  const parts = [get(msg, 'MSH-9.1'), get(msg, 'MSH-9.2'), get(msg, 'MSH-10')].map((part) => part.trim()).filter(Boolean);
  const name = parts.join('_').replaceAll(/[^\w.-]/g, '_').slice(0, 80);
  return `${name || 'message'}.hl7`;
}

/* ---- reading ---- */

// Windows-1252 byte -> character, for the bytes that differ from Latin-1
const WINDOWS_1252_CHARS = new Map([...WINDOWS_1252].map(([char, byte]) => [byte, char]));

function decodeWindows1252(buffer) {
  return Array.from(buffer, (byte) => WINDOWS_1252_CHARS.get(byte) ?? String.fromCodePoint(byte)).join('');
}

const startsWith = (buffer, bytes) => bytes.every((byte, i) => buffer[i] === byte);

/** Text and encoding of a file: UTF-8 (with or without a byte order mark), UTF-16, or else Windows-1252. */
function decodeBuffer(buffer) {
  if (startsWith(buffer, [0xff, 0xfe])) return { text: new TextDecoder('utf-16le').decode(buffer.subarray(2)), encoding: 'utf-16' };
  if (startsWith(buffer, [0xfe, 0xff])) return { text: new TextDecoder('utf-16le').decode(Buffer.from(buffer.subarray(2)).swap16()), encoding: 'utf-16' };
  const body = startsWith(buffer, [0xef, 0xbb, 0xbf]) ? buffer.subarray(3) : buffer;
  try {
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(body), encoding: 'utf-8' };
  } catch {
    return { text: decodeWindows1252(body), encoding: 'windows-1252' };
  }
}

/** The line ending the file uses most clearly; null when it has only one line. */
function detectLineEnding(fileText) {
  const text = fileText.replaceAll(MLLP_END, ''); // the <CR> after an MLLP frame says nothing about the segments
  if (text.includes('\r\n')) return 'crlf';
  if (text.includes('\r')) return 'cr';
  return text.includes('\n') ? 'lf' : null;
}

/** One message as the list shows it. */
function describeMessage(text) {
  const msg = parseMessage(text);
  return {
    text,
    type: messageTypeLabel(get(msg, 'MSH-9.1').trim(), get(msg, 'MSH-9.2').trim()),
    patient: patientLabel(text),
    time: get(msg, 'MSH-7').trim(),
    controlId: get(msg, 'MSH-10').trim(),
  };
}

/**
 * Everything the page needs from a file: its messages (plain or MLLP-framed, one or many,
 * with or without batch headers) and how it was written, so it can be saved the same way.
 */
function readMessages(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('The file contents must be bytes.');
  if (buffer.length > MAX_BYTES) throw new Error('The file is too large to open.');
  if (buffer.includes(0) && !startsWith(buffer, [0xff, 0xfe]) && !startsWith(buffer, [0xfe, 0xff])) {
    throw new Error('This does not look like a text file.');
  }
  const { text, encoding } = decodeBuffer(buffer);
  const messages = splitMessages(text).map(describeMessage);
  if (messages.length === 0) throw new Error('The file is empty.');
  const notes = [];
  if (encoding === 'windows-1252') notes.push('The file is not valid UTF-8, so it was read as Windows-1252.');
  if (encoding === 'utf-16') notes.push('The file is UTF-16; it will be saved as UTF-8.');
  return {
    messages,
    notes,
    format: { lineEnding: detectLineEnding(text), mllp: text.includes(MLLP_START), encoding: encoding === 'utf-16' ? 'utf-8' : encoding },
    batch: /^(FHS|BHS)[^A-Za-z0-9]/m.test(text),
  };
}

/* ---- exporting several messages ---- */

const EXPORT_MODES = new Set(['one', 'each', 'type']);
const MAX_EXPORT_FILES = 10000;
const MAX_EXPORT_BYTES = 200 * 1024 * 1024;

const safeName = (text) => text.replaceAll(/[^\w.-]/g, '_').slice(0, 80);

/** Gives each name a number when an earlier file already has it. */
function uniqueNames(names) {
  const seen = new Map();
  return names.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    if (count === 1) return name;
    const dot = name.lastIndexOf('.');
    return `${name.slice(0, dot)}_${count}${name.slice(dot)}`;
  });
}

/**
 * Which files an export writes: [{ fileName, texts }].
 *  one  - all messages in one file
 *  each - one file per message, numbered so that they stay in order
 *  type - one file per message type (ADT^A01, ORU^R01, ...)
 */
function planExport(texts, { mode = 'one', now = new Date() } = {}) {
  if (!Array.isArray(texts) || texts.some((text) => typeof text !== 'string')) throw new TypeError('The messages must be a list of text.');
  const messages = texts.filter((text) => text.trim() !== '');
  if (messages.length === 0) throw new Error('There are no messages to export.');
  if (!EXPORT_MODES.has(mode)) throw new Error(`Unknown export mode: ${mode}`);
  if (mode === 'one') return [{ fileName: `messages_${messages.length}_${timestamp(now)}.hl7`, texts: messages }];
  if (mode === 'each') {
    if (messages.length > MAX_EXPORT_FILES) {
      throw new Error(`That would be more than ${MAX_EXPORT_FILES} files. Choose "One file" or "One file per message type" instead.`);
    }
    const width = String(messages.length).length;
    return messages.map((text, i) => {
      const { type, controlId } = describeMessage(text);
      return { fileName: `${String(i + 1).padStart(width, '0')}_${safeName([type, controlId].filter(Boolean).join('_')) || 'message'}.hl7`, texts: [text] };
    });
  }
  const groups = new Map();
  for (const text of messages) {
    const type = describeMessage(text).type;
    if (!groups.has(type)) groups.set(type, []);
    groups.get(type).push(text);
  }
  const names = uniqueNames([...groups.keys()].map((type) => `${safeName(type) || 'other'}.hl7`));
  return [...groups.values()].map((group, i) => ({ fileName: names[i], texts: group }));
}

/** FHS/BHS before and BTS/FTS after the messages (the HL7 batch file protocol). */
function batchEnvelope(texts, fileName, now) {
  const first = parseMessage(texts[0]);
  const parties = [get(first, 'MSH-3.1'), get(first, 'MSH-4.1'), get(first, 'MSH-5.1'), get(first, 'MSH-6.1')];
  const stamp = timestamp(now);
  const header = [
    ['FHS', String.raw`^~\&`, ...parties, stamp, '', fileName, '', `FILE${stamp}`],
    ['BHS', String.raw`^~\&`, ...parties, stamp, '', '', '', `BATCH${stamp}`],
  ];
  const trailer = [['BTS', String(texts.length)], ['FTS', '1']];
  return { header: header.map((fields) => fields.join('|')), trailer: trailer.map((fields) => fields.join('|')) };
}

/** The bytes of one export file. A batch header and MLLP framing do not go together: batches are for files, MLLP for the network. */
function prepareExport(texts, { lineEnding = 'cr', encoding = 'utf-8', mllp = false, batch = false, fileName = 'messages.hl7', now = new Date() } = {}) {
  if (!Array.isArray(texts) || texts.length === 0) throw new Error('There are no messages to export.');
  if (batch && mllp) throw new Error('A batch file and MLLP framing cannot be combined. Switch one of them off.');
  if (!Object.hasOwn(LINE_ENDINGS, lineEnding)) throw new Error(`Unknown line ending: ${lineEnding}`);
  if (!ENCODINGS.has(encoding)) throw new Error(`Unknown encoding: ${encoding}`);
  const eol = LINE_ENDINGS[lineEnding];
  const bodies = texts.map((text) => normalizeLineEndings(text, lineEnding)).filter((body) => body !== '');
  if (bodies.length === 0) throw new Error('There are no messages to export.');
  let parts = mllp ? bodies.map((body) => `${MLLP_START}${body}${MLLP_END}`) : bodies;
  if (batch) {
    const { header, trailer } = batchEnvelope(texts, fileName, now);
    parts = [...header.map((line) => line + eol), ...bodies, ...trailer.map((line) => line + eol)];
  }
  const data = encodeText(parts.join(''), encoding);
  if (data.length > MAX_BYTES) throw new Error('The export file would be too large.');
  return { data, count: bodies.length };
}

/** The bytes of every file of the plan, before anything is written, so a problem (such as a character Windows-1252 cannot hold) stops the export before the first file. */
function prepareExportFiles(plan, options) {
  const prepared = plan.map((file) => ({ fileName: file.fileName, data: prepareExport(file.texts, { ...options, fileName: file.fileName }).data }));
  const total = prepared.reduce((sum, file) => sum + file.data.length, 0);
  if (total > MAX_EXPORT_BYTES) throw new Error('The export would be too large.');
  return prepared;
}

/** Names from the prepared files that already exist in the folder. */
async function existingFiles(folder, prepared) {
  const checks = await Promise.all(prepared.map(({ fileName }) => fs.access(nodePath.join(folder, fileName)).then(() => true, () => false)));
  return prepared.filter((_file, i) => checks[i]).map((file) => file.fileName);
}

/** Writes the prepared files into the folder, one after the other; onProgress(done, total) is called as it goes. */
async function writeExport(folder, prepared, onProgress = () => {}) {
  let bytes = 0;
  let done = 0;
  // a chain of promises instead of await in a loop: the files must be written in order, not all at once
  await prepared.reduce((previous, file) => previous.then(async () => {
    await fs.writeFile(nodePath.join(folder, file.fileName), file.data);
    bytes += file.data.length;
    done += 1;
    onProgress(done, prepared.length);
  }), Promise.resolve());
  return { files: prepared.length, bytes };
}

async function readFile(path) {
  const stat = await fs.stat(path);
  if (stat.size > MAX_BYTES) throw new Error('The file is too large to open.');
  return fs.readFile(path);
}

async function writeFile(path, data) {
  await fs.writeFile(path, data);
}

module.exports = {
  prepareFile, suggestFileName, normalizeLineEndings, encodeText, decodeBuffer, readMessages, readFile, writeFile,
  planExport, prepareExport, prepareExportFiles, existingFiles, writeExport, describeMessage, LINE_ENDINGS, ENCODINGS, EXPORT_MODES,
};
