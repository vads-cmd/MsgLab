#!/usr/bin/env node
'use strict';

/**
 * A local MLLP test server for the terminal, so sending can be tried without a real HL7 server.
 *
 *   node scripts/mllp-check.js serve [options]
 *
 * It answers every message with an ACK and prints one line per message. By default it says AA;
 * the "every" options change the answer for every N-th message (counted over all connections):
 *
 *   --port N            port to listen on (default 2575; 0 picks a free one)
 *   --host NAME         address to listen on (default 127.0.0.1)
 *   --mode NAME         the answer to give: accept (default), error, reject, enhanced, enhancedError,
 *                       enhancedReject, silent, close, unframed, garbage, split, mismatch, closeAfterReply
 *   --error-every N     every N-th message gets ACK AE
 *   --reject-every N    every N-th message gets ACK AR
 *   --silent-every N    every N-th message gets no answer at all
 *   --close-every N     every N-th message: the connection is closed without an answer
 *   --delay MS          wait this long before every answer (default 0)
 *   --text TEXT         text for MSA-3 (the ACK text)
 *
 * When several "every" options meet on one message, the first of close, silent, reject, error wins.
 * Stop with Ctrl+C; a summary is printed.
 */

const { startMockServer } = require('../tests/support/mock-mllp-server');
const { parseMessage, get } = require('../src/hl7/parser');

const MODES = [
  'accept', 'error', 'reject', 'enhanced', 'enhancedError', 'enhancedReject', 'silent', 'close',
  'unframed', 'garbage', 'split', 'mismatch', 'closeAfterReply',
];
const EVERY = [['close-every', 'close'], ['silent-every', 'silent'], ['reject-every', 'reject'], ['error-every', 'error']];

const USAGE = `Usage: node scripts/mllp-check.js serve [--port N] [--host NAME] [--mode NAME]
         [--error-every N] [--reject-every N] [--silent-every N] [--close-every N]
         [--delay MS] [--text TEXT]
Modes: ${MODES.join(', ')}`;

function wholeNumber(name, value, min) {
  const number = Number(value);
  if (value === undefined || value === '' || !Number.isInteger(number) || number < min) {
    throw new Error(`--${name} needs a whole number of ${min} or more.`);
  }
  return number;
}

/** What each option does to the options. */
const SETTERS = {
  port: (options, value, name) => { options.port = wholeNumber(name, value, 0); },
  host: (options, value) => { options.host = value; },
  delay: (options, value, name) => { options.delayMs = wholeNumber(name, value, 0); },
  text: (options, value) => { options.text = value; },
  mode: (options, value) => {
    if (!MODES.includes(value)) throw new Error(`Unknown mode "${value}". Modes: ${MODES.join(', ')}.`);
    options.mode = value;
  },
};

/** Reads one "--name value" pair into the options. */
function applyFlag(options, flag, value) {
  if (!flag.startsWith('--')) throw new Error(`Unexpected "${flag}".`);
  const name = flag.slice(2);
  if (value === undefined) throw new Error(`${flag} needs a value.`);
  if (Object.hasOwn(SETTERS, name)) SETTERS[name](options, value, name);
  else if (EVERY.some(([key]) => key === name)) options.every[name] = wholeNumber(name, value, 1);
  else throw new Error(`Unknown option ${flag}.`);
}

/** Turns the command line into options. Throws an Error with a plain message for anything wrong. */
function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') return { help: true };
  if (command !== 'serve') throw new Error(`Unknown command "${command}". Only "serve" exists.`);
  const options = { port: 2575, host: '127.0.0.1', mode: 'accept', delayMs: 0, text: '', every: {} };
  for (let i = 0; i < rest.length; i += 2) applyFlag(options, rest[i], rest[i + 1]);
  return options;
}

/** The answer for the n-th message (1, 2, 3 ...). */
function modeFor(options, number) {
  for (const [key, mode] of EVERY) {
    const every = options.every[key];
    if (every && number % every === 0) return mode;
  }
  return options.mode;
}

const describe = (text) => {
  try {
    const message = parseMessage(text);
    return `${get(message, 'MSH-9') || 'no type'}  ${get(message, 'MSH-10') || 'no control ID'}`;
  } catch {
    return 'not an HL7 message';
  }
};

/** Starts the server. log(line) gets one line per message. Returns the mock server (port, close, ...). */
function startServer(options, log = () => {}) {
  return startMockServer({
    host: options.host,
    port: options.port,
    delayMs: options.delayMs,
    text: options.text,
    mode: (number) => modeFor(options, number),
    onMessage: ({ number, text, mode }) => log(`#${number}  ${describe(text)}  ->  ${mode}`),
  });
}

async function main(argv) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\n\n${USAGE}`);
    return 2;
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const counts = new Map();
  const server = await startServer(options, (line) => {
    const mode = line.split('->  ')[1];
    counts.set(mode, (counts.get(mode) ?? 0) + 1);
    console.log(`${new Date().toISOString().slice(11, 19)}  ${line}`);
  });
  console.log(`MLLP test server on ${server.host}:${server.port}. Ctrl+C stops it.`);
  await new Promise((resolve) => process.once('SIGINT', resolve));
  await server.close();
  const summary = [...counts].map(([mode, count]) => `${count} ${mode}`).join(', ') || 'no messages';
  console.log(`\n${server.received.length} messages on ${server.connections} connections (${summary}).`);
  return 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { parseArgs, modeFor, startServer, MODES };
