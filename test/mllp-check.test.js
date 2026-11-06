'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseArgs, modeFor, startServer } = require('../scripts/mllp-check');
const { sendMessage } = require('../src/mllp');

const MESSAGE = ['MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01^ADT_A01|MSG0001|T|2.5.1', 'PID|1||123^^^MAIN^MR||DOE^JOHN'].join('\r');
const FAST = { connectTimeoutMs: 1000, replyTimeoutMs: 1000 };

test('serve without options uses the defaults', () => {
  assert.deepStrictEqual(parseArgs(['serve']), { port: 2575, host: '127.0.0.1', mode: 'accept', delayMs: 0, text: '', every: {} });
});

test('no command or --help asks for the help text', () => {
  assert.deepStrictEqual(parseArgs([]), { help: true });
  assert.deepStrictEqual(parseArgs(['--help']), { help: true });
});

test('options are read with their values', () => {
  const options = parseArgs(['serve', '--port', '0', '--error-every', '5', '--delay', '20', '--mode', 'reject', '--text', 'busy']);
  assert.strictEqual(options.port, 0);
  assert.strictEqual(options.delayMs, 20);
  assert.strictEqual(options.mode, 'reject');
  assert.strictEqual(options.text, 'busy');
  assert.deepStrictEqual(options.every, { 'error-every': 5 });
});

test('wrong options are refused with a plain message', () => {
  assert.throws(() => parseArgs(['send']), /Unknown command/);
  assert.throws(() => parseArgs(['serve', '--nope', '1']), /Unknown option --nope/);
  assert.throws(() => parseArgs(['serve', '--port']), /needs a value/);
  assert.throws(() => parseArgs(['serve', '--port', 'abc']), /whole number/);
  assert.throws(() => parseArgs(['serve', '--error-every', '0']), /1 or more/);
  assert.throws(() => parseArgs(['serve', '--mode', 'wrong']), /Unknown mode/);
});

test('every N-th message gets the special answer, the rest the mode', () => {
  const options = parseArgs(['serve', '--error-every', '3']);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => modeFor(options, n)), ['accept', 'accept', 'error', 'accept', 'accept', 'error']);
});

test('when several rules meet, close wins over silent, reject and error', () => {
  const options = parseArgs(['serve', '--error-every', '2', '--reject-every', '2', '--silent-every', '2', '--close-every', '2']);
  assert.strictEqual(modeFor(options, 2), 'close');
  assert.strictEqual(modeFor(parseArgs(['serve', '--error-every', '2', '--reject-every', '2']), 2), 'reject');
});

test('the server answers AE on every second message and logs each one', async () => {
  const lines = [];
  const server = await startServer(parseArgs(['serve', '--port', '0', '--error-every', '2']), (line) => lines.push(line));
  try {
    const outcomes = [];
    for (let i = 0; i < 4; i += 1) {
      outcomes.push((await sendMessage({ host: server.host, port: server.port, message: MESSAGE, ...FAST })).outcome);
    }
    assert.deepStrictEqual(outcomes, ['accepted', 'application-error', 'accepted', 'application-error']);
    assert.strictEqual(lines.length, 4);
    assert.match(lines[1], /^#2 {2}ADT\^A01\^ADT_A01 {2}MSG0001 {2}-> {2}error$/);
  } finally {
    await server.close();
  }
});
