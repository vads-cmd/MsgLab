'use strict';

/**
 * Preparing a message for a file: line endings, optional MLLP framing, encoding, file name.
 * No Electron in here, so everything can be tested on its own.
 */

const fs = require('node:fs/promises');
const { parseMessage, splitMessages, get } = require('./hl7/parser');
const { patientLabel } = require('./hl7/bulk');
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

async function readFile(path) {
  const stat = await fs.stat(path);
  if (stat.size > MAX_BYTES) throw new Error('The file is too large to open.');
  return fs.readFile(path);
}

async function writeFile(path, data) {
  await fs.writeFile(path, data);
}

module.exports = {
  prepareFile, suggestFileName, normalizeLineEndings, encodeText, decodeBuffer, readMessages, readFile, writeFile, LINE_ENDINGS, ENCODINGS,
};
