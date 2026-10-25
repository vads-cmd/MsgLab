'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const {
  frameMessage, toWireText, FrameReader, parseAck, validateTarget, sendMessage, testConnection, cleanRequest, visibleText, hexDump,
  DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_REPLY_TIMEOUT_MS,
} = require('../src/mllp');
const { startMockServer, buildAck } = require('../tests/support/mock-mllp-server');

const SEGMENTS = ['MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01^ADT_A01|MSG0001|T|2.5.1', 'EVN|A01|20261023120000', 'PID|1||123^^^MAIN^MR||DOE^JOHN'];
const MESSAGE = SEGMENTS.join('\r');
const FAST = { connectTimeoutMs: 1000, replyTimeoutMs: 1000 };

/** Run a test body with a mock server, and always close it. */
async function withServer(options, body) {
  const server = await startMockServer(options);
  try {
    await body(server);
  } finally {
    await server.close();
  }
}

const send = (server, extra = {}) => sendMessage({ host: server.host, port: server.port, message: MESSAGE, ...FAST, ...extra });

// ------------------------------------------------------------ framing

test('a message is framed as <VT> message <FS><CR>', () => {
  const bytes = frameMessage(MESSAGE);
  assert.strictEqual(bytes[0], 0x0b);
  assert.deepStrictEqual([...bytes.subarray(-2)], [0x1c, 0x0d]);
  assert.strictEqual(bytes.subarray(1, -2).toString('utf8'), `${MESSAGE}\r`);
});

test('every kind of line ending goes out as CR, with one CR after the last segment', () => {
  for (const text of [SEGMENTS.join('\n'), SEGMENTS.join('\r\n'), `${SEGMENTS.join('\r')}\r\r\r`, `\n${SEGMENTS.join('\n\n')}\n`]) {
    assert.strictEqual(toWireText(text), `${MESSAGE}\r`);
  }
});

test('framing bytes inside the text are dropped so they cannot break the frame', () => {
  assert.strictEqual(toWireText('MSH|a\x0b|b\x1c\rPID|1'), 'MSH|a|b\rPID|1\r');
});

test('the chosen encoding is used, and a character that does not fit is an error', () => {
  const text = 'MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01|M1|T|2.5.1\rPID|1||1||MÜLLER^JÜRGEN';
  assert.ok(frameMessage(text, 'utf-8').includes(Buffer.from('MÜLLER', 'utf8')));
  assert.ok(frameMessage(text, 'windows-1252').includes(Buffer.from([0x4d, 0xdc, 0x4c, 0x4c, 0x45, 0x52])));
  assert.throws(() => frameMessage('MSH|x\rPID|1||1||山田', 'windows-1252'), /cannot be saved in Windows-1252/);
});

// ------------------------------------------------------------ reading frames

test('a frame is read from one piece', () => {
  const reader = new FrameReader();
  const frames = reader.push(frameMessage(MESSAGE));
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].toString('utf8'), `${MESSAGE}\r`);
  assert.strictEqual(reader.strayBytes, 1); // the CR after <FS> belongs to no frame
});

test('a frame that arrives byte by byte is read once it is complete', () => {
  const reader = new FrameReader();
  const bytes = frameMessage(MESSAGE);
  const frames = [];
  for (const byte of bytes) frames.push(...reader.push(Buffer.from([byte])));
  assert.strictEqual(frames.length, 1);
  assert.strictEqual(frames[0].toString('utf8'), `${MESSAGE}\r`);
});

test('two frames in one piece are two frames', () => {
  const frames = new FrameReader().push(Buffer.concat([frameMessage('MSH|a'), frameMessage('MSH|b')]));
  assert.deepStrictEqual(frames.map((frame) => frame.toString('utf8')), ['MSH|a\r', 'MSH|b\r']);
});

test('an unfinished frame stays pending and bytes before a frame are counted as stray', () => {
  const reader = new FrameReader();
  assert.deepStrictEqual(reader.push(Buffer.from('noise\x0bMSH|abc')), []);
  assert.strictEqual(reader.strayBytes, 5);
  assert.strictEqual(reader.pendingBytes, 8);
});

test('a reply without an end of frame that grows too large is an error', () => {
  const reader = new FrameReader(16);
  assert.throws(() => reader.push(Buffer.concat([Buffer.from([0x0b]), Buffer.alloc(40, 0x41)])), /larger than 16 bytes/);
});

// ------------------------------------------------------------ understanding an ACK

test('the ACK codes are understood, in original and enhanced mode', () => {
  const expected = { AA: 'accepted', CA: 'accepted', AE: 'error', CE: 'error', AR: 'rejected', CR: 'rejected', XX: 'unknown' };
  for (const [code, level] of Object.entries(expected)) {
    const ack = parseAck(buildAck(MESSAGE, code, 'some text'));
    assert.strictEqual(ack.code, code);
    assert.strictEqual(ack.level, level);
    assert.strictEqual(ack.controlId, 'MSG0001');
    assert.strictEqual(ack.text, 'some text');
  }
});

test('lower case codes are accepted and ERR segments are collected', () => {
  const ack = parseAck('MSH|^~\\&|EHR|MAIN|HIS|MAIN|20261026||ACK^A01|X1|P|2.5.1\rMSA|ae|MSG0001|bad\rERR||PID^1^3|101^Required field missing^HL70357\rERR|||102\r');
  assert.strictEqual(ack.code, 'AE');
  assert.strictEqual(ack.errors.length, 2);
  assert.match(ack.errors[0], /Required field missing/);
});

test('a reply without MSA says so', () => {
  const ack = parseAck('MSH|^~\\&|EHR|MAIN|HIS|MAIN|20261026||ORU^R01|X1|P|2.5.1\rPID|1\r');
  assert.strictEqual(ack.hasMsa, false);
  assert.strictEqual(ack.level, 'unknown');
});

// ------------------------------------------------------------ the target

test('the target is checked and cleaned', () => {
  assert.deepStrictEqual(validateTarget({ host: ' hapi.example.org ', port: '2575' }), { host: 'hapi.example.org', port: 2575 });
  assert.deepStrictEqual(validateTarget({ host: '[::1]', port: 2575 }), { host: '::1', port: 2575 });
  assert.deepStrictEqual(validateTarget({ host: '10.0.0.5', port: 65535 }), { host: '10.0.0.5', port: 65535 });
  for (const bad of [{ host: '', port: 1 }, { host: '   ', port: 1 }, { host: 'a b', port: 1 }, { host: 'x;rm', port: 1 }, { host: 'a'.repeat(300), port: 1 }]) {
    assert.ok(validateTarget(bad).error, JSON.stringify(bad));
  }
  for (const port of [0, 65536, -1, 2575.5, 'abc', '', null, undefined]) {
    assert.match(validateTarget({ host: 'localhost', port }).error, /port/i, String(port));
  }
});

test('raw bytes can be shown as hex and with visible framing bytes', () => {
  const bytes = frameMessage('MSH|a\rPID|1');
  assert.strictEqual(hexDump(Buffer.from([0x0b, 0x41, 0x1c, 0x0d])), '0b 41 1c 0d');
  assert.strictEqual(visibleText(bytes), '<VT>MSH|a<CR>\nPID|1<CR>\n<FS><CR>\n');
});

// ------------------------------------------------------------ sending to a server

test('a message is sent and the ACK AA comes back', async () => {
  await withServer({}, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.outcome, 'accepted');
    assert.strictEqual(result.ack.code, 'AA');
    assert.deepStrictEqual(result.warnings, []);
    assert.ok(result.connectMs >= 0 && result.totalMs >= result.connectMs);
    assert.strictEqual(result.bytesSent, frameMessage(MESSAGE).length);
    assert.match(result.reply.visible, /^<VT>MSH\|/);
    assert.match(result.ackText, /MSA\|AA\|MSG0001/);
    assert.strictEqual(server.received.length, 1);
    assert.strictEqual(server.received[0].text, `${MESSAGE}\r`);
  });
});

test('the enhanced mode ACK CA counts as accepted', async () => {
  await withServer({ mode: 'enhanced' }, async (server) => {
    assert.strictEqual((await send(server)).outcome, 'accepted');
  });
});

test('ACK AE and ACK AR are reported as such, with the server text', async () => {
  await withServer({ mode: 'error', text: 'Patient not found' }, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.outcome, 'application-error');
    assert.match(result.message, /could not process/);
    assert.match(result.message, /Patient not found/);
  });
  await withServer({ mode: 'reject' }, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.outcome, 'rejected');
    assert.strictEqual(result.ack.code, 'AR');
  });
});

test('a reply that arrives in tiny pieces is put together', async () => {
  await withServer({ mode: 'split' }, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.outcome, 'accepted');
  });
});

test('an ACK for another message is accepted but with a warning', async () => {
  await withServer({ mode: 'mismatch' }, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.outcome, 'accepted');
    assert.strictEqual(result.warnings.length, 1);
    assert.match(result.warnings[0], /OTHER-ID/);
  });
});

test('a framed reply that is not an ACK is reported', async () => {
  await withServer({ mode: 'garbage' }, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.outcome, 'invalid-ack');
    assert.match(result.message, /no MSA/);
  });
});

test('a reply without MLLP framing is reported and the raw bytes are kept', async () => {
  await withServer({ mode: 'unframed' }, async (server) => {
    const result = await send(server, { replyTimeoutMs: 300 });
    assert.strictEqual(result.outcome, 'not-framed');
    assert.match(result.message, /not in MLLP framing/);
    assert.match(result.reply.visible, /MSA\|AA/);
    assert.ok(result.reply.bytes > 0);
  });
});

test('a server that never answers ends in a reply timeout', async () => {
  await withServer({ mode: 'silent' }, async (server) => {
    const result = await send(server, { replyTimeoutMs: 150 });
    assert.strictEqual(result.outcome, 'reply-timeout');
    assert.strictEqual(result.ok, false);
    assert.strictEqual(server.received.length, 1);
  });
});

test('a server that closes without an ACK is reported', async () => {
  await withServer({ mode: 'close' }, async (server) => {
    const result = await send(server);
    assert.strictEqual(result.outcome, 'closed');
    assert.match(result.message, /without sending an ACK/);
  });
});

test('a port nobody listens on is a connection failure with a hint', async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const result = await sendMessage({ host: '127.0.0.1', port, message: MESSAGE, ...FAST });
  assert.strictEqual(result.outcome, 'connect-failed');
  assert.strictEqual(result.code, 'ECONNREFUSED');
  assert.match(result.message, /Nothing is listening/);
  assert.strictEqual(result.connectMs, null);
});

test('a host name that does not exist is a connection failure', async () => {
  const result = await sendMessage({ host: 'no-such-host.invalid', port: 2575, message: MESSAGE, ...FAST });
  assert.strictEqual(result.outcome, 'connect-failed');
  assert.match(result.message, /Could not connect to no-such-host\.invalid:2575/);
});

test('sending can be cancelled', async () => {
  await withServer({ mode: 'silent' }, async (server) => {
    const controller = new AbortController();
    const pending = send(server, { replyTimeoutMs: 5000, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    const result = await pending;
    assert.strictEqual(result.outcome, 'cancelled');
  });
});

test('an already cancelled send does not connect', async () => {
  await withServer({}, async (server) => {
    const controller = new AbortController();
    controller.abort();
    const result = await send(server, { signal: controller.signal });
    assert.strictEqual(result.outcome, 'cancelled');
    assert.strictEqual(server.connections, 0);
  });
});

test('bad input is reported before any connection is made', async () => {
  const cases = [
    [{ host: '', port: 2575, message: MESSAGE }, /host name/],
    [{ host: 'localhost', port: 0, message: MESSAGE }, /port/],
    [{ host: 'localhost', port: 2575, message: '  \n ' }, /no message/],
    [{ host: 'localhost', port: 2575, message: 'MSH|x\rPID|1||1||山田', encoding: 'windows-1252' }, /Windows-1252/],
  ];
  for (const [options, pattern] of cases) {
    const result = await sendMessage(options);
    assert.strictEqual(result.outcome, 'invalid-input');
    assert.strictEqual(result.ok, false);
    assert.match(result.message, pattern);
  }
});

test('the message goes out in the chosen encoding', async () => {
  const text = 'MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01|M7|T|2.5.1\rPID|1||1||MÜLLER^JÜRGEN';
  await withServer({}, async (server) => {
    await sendMessage({ host: server.host, port: server.port, message: text, encoding: 'windows-1252', ...FAST });
    assert.ok(server.received[0].bytes.includes(Buffer.from([0x4d, 0xdc, 0x4c, 0x4c, 0x45, 0x52])));
  });
});

// ------------------------------------------------------------ testing a connection

test('a server that accepts connections is reachable, and nothing is sent to it', async () => {
  await withServer({}, async (server) => {
    const result = await testConnection({ host: server.host, port: server.port, connectTimeoutMs: 1000 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.outcome, 'reachable');
    assert.ok(result.connectMs >= 0);
    assert.match(result.message, /Nothing was sent/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(server.received.length, 0);
    assert.strictEqual(server.connections, 1);
  });
});

test('a port nobody listens on fails the connection test with a hint', async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const result = await testConnection({ host: '127.0.0.1', port, connectTimeoutMs: 1000 });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.outcome, 'connect-failed');
  assert.strictEqual(result.code, 'ECONNREFUSED');
  assert.match(result.message, /Nothing is listening/);
});

test('the connection test checks its input and can be cancelled', async () => {
  assert.strictEqual((await testConnection({ host: '', port: 1 })).outcome, 'invalid-input');
  assert.strictEqual((await testConnection({ host: 'localhost', port: 70000 })).outcome, 'invalid-input');
  const controller = new AbortController();
  controller.abort();
  await withServer({}, async (server) => {
    const result = await testConnection({ host: server.host, port: server.port, signal: controller.signal });
    assert.strictEqual(result.outcome, 'cancelled');
    assert.strictEqual(server.connections, 0);
  });
});

// ------------------------------------------------------------ requests from the window

test('a request from the window is turned into options, with seconds as milliseconds', () => {
  const request = cleanRequest({ requestId: 'req-1', host: 'srv', port: '2575', message: MESSAGE, connectTimeoutSeconds: '5', replyTimeoutSeconds: 20, encoding: 'windows-1252' }, { needsMessage: true });
  assert.deepStrictEqual(request, {
    requestId: 'req-1',
    options: { host: 'srv', port: '2575', connectTimeoutMs: 5000, message: MESSAGE, replyTimeoutMs: 20000, encoding: 'windows-1252' },
  });
});

test('a request without a message is fine for a connection test, and has no message options', () => {
  const request = cleanRequest({ requestId: 'req-2', host: 'srv', port: 1, message: 'ignored' }, { needsMessage: false });
  assert.deepStrictEqual(request.options, { host: 'srv', port: 1, connectTimeoutMs: DEFAULT_CONNECT_TIMEOUT_MS });
});

test('timeouts that make no sense fall back to the defaults, and long ones are limited to ten minutes', () => {
  for (const bad of ['', 'abc', 0, -5, null, undefined, Number.NaN]) {
    const { options } = cleanRequest({ requestId: 'r', host: 'h', port: 1, message: 'm', connectTimeoutSeconds: bad, replyTimeoutSeconds: bad }, { needsMessage: true });
    assert.strictEqual(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS, String(bad));
    assert.strictEqual(options.replyTimeoutMs, DEFAULT_REPLY_TIMEOUT_MS, String(bad));
  }
  const { options } = cleanRequest({ requestId: 'r', host: 'h', port: 1, message: 'm', connectTimeoutSeconds: 99999 }, { needsMessage: true });
  assert.strictEqual(options.connectTimeoutMs, 600_000);
});

test('an unknown encoding becomes UTF-8', () => {
  const { options } = cleanRequest({ requestId: 'r', host: 'h', port: 1, message: 'm', encoding: 'latin-9' }, { needsMessage: true });
  assert.strictEqual(options.encoding, 'utf-8');
});

test('requests that are not valid are refused', () => {
  const refused = [
    [null, /not valid/], ['text', /not valid/], [[], /not valid/],
    [{ host: 'h', port: 1, message: 'm' }, /ID/], [{ requestId: '', host: 'h' }, /ID/], [{ requestId: 'a b', host: 'h' }, /ID/], [{ requestId: 'x'.repeat(65), host: 'h' }, /ID/],
    [{ requestId: 'r', host: 'h', port: 1 }, /no message/], [{ requestId: 'r', host: 'h', port: 1, message: 5 }, /no message/],
    [{ requestId: 'r', host: 'h', port: 1, message: 'x'.repeat(5 * 1024 * 1024 + 1) }, /too large/],
  ];
  for (const [payload, pattern] of refused) assert.match(cleanRequest(payload, { needsMessage: true }).error, pattern, JSON.stringify(payload)?.slice(0, 60));
});

test('values of the wrong type for host and port do not get through', () => {
  const { options } = cleanRequest({ requestId: 'r', host: { toString: 'x' }, port: { a: 1 } }, { needsMessage: false });
  assert.strictEqual(options.host, '');
  assert.strictEqual(options.port, '');
  assert.ok(validateTarget(options).error);
});
