'use strict';

const test = require('node:test');
const assert = require('node:assert');
const net = require('node:net');
const { sendBatch, cleanBatchRequest, abortableSleep, MAX_MESSAGES, DEFAULT_DELAY_SECONDS } = require('../src/send-batch');
const { MllpSession } = require('../src/mllp');
const { startMockServer } = require('../tests/support/mock-mllp-server');

const message = (id, extra = '') => `MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01^ADT_A01|${id}|T|2.5.1\rPID|1||${id}^^^MAIN^MR||DOE^JOHN${extra}`;
const messages = (count) => Array.from({ length: count }, (_, index) => message(`M${index + 1}`));
const FAST = { connectTimeoutMs: 1000, replyTimeoutMs: 1000 };

async function withServer(options, body) {
  const server = await startMockServer(options);
  try {
    await body(server);
  } finally {
    await server.close();
  }
}

const run = (server, list, extra = {}) => sendBatch({ host: server.host, port: server.port, messages: list, ...FAST, ...extra });

// ------------------------------------------------------------ the run

test('all messages go over one connection, in order, and are counted', async () => {
  await withServer({}, async (server) => {
    const summary = await run(server, messages(5));
    assert.strictEqual(summary.status, 'finished');
    assert.deepStrictEqual([summary.total, summary.attempted, summary.accepted, summary.failed, summary.reconnects], [5, 5, 5, 0, 0]);
    assert.strictEqual(server.connections, 1);
    assert.deepStrictEqual(server.received.map((item) => item.text.split('\r')[0].split('|')[9]), ['M1', 'M2', 'M3', 'M4', 'M5']);
    assert.deepStrictEqual(summary.results.map((item) => item.number), [1, 2, 3, 4, 5]);
  });
});

test('every result line says what was sent and how it went', async () => {
  await withServer({}, async (server) => {
    const { results } = await run(server, [message('A1')]);
    const [line] = results;
    assert.strictEqual(line.type, 'ADT^A01^ADT_A01');
    assert.strictEqual(line.controlId, 'A1');
    assert.strictEqual(line.ok, true);
    assert.strictEqual(line.outcome, 'accepted');
    assert.strictEqual(line.ackCode, 'AA');
    assert.ok(line.ms >= 0);
    assert.match(line.sentAt, /^\d{4}-\d\d-\d\dT/);
  });
});

test('the pause between messages is kept, and there is none after the last one', async () => {
  await withServer({}, async (server) => {
    const events = [];
    const started = Date.now();
    await run(server, messages(3), { delayMs: 80, onProgress: (event) => events.push(event.kind) });
    assert.ok(Date.now() - started >= 150, 'two pauses of 80 ms');
    assert.deepStrictEqual(events, ['sent', 'waiting', 'sent', 'waiting', 'sent']);
  });
});

test('progress says how far the run is, and when the next message goes out', async () => {
  await withServer({ mode: (n) => (n === 2 ? 'reject' : 'accept') }, async (server) => {
    const events = [];
    const before = Date.now();
    await run(server, messages(3), { delayMs: 30, onProgress: (event) => events.push(event) });
    const sent = events.filter((event) => event.kind === 'sent');
    assert.deepStrictEqual(sent.map((event) => [event.done, event.accepted, event.failed, event.total]), [[1, 1, 0, 3], [2, 1, 1, 3], [3, 2, 1, 3]]);
    const waiting = events.find((event) => event.kind === 'waiting');
    assert.ok(waiting.nextAt >= before + 30 && waiting.nextAt <= Date.now() + 30);
  });
});

test('a message that is not accepted does not stop the run by default', async () => {
  await withServer({ mode: (n) => (n === 2 ? 'reject' : 'accept') }, async (server) => {
    const summary = await run(server, messages(4));
    assert.strictEqual(summary.status, 'finished');
    assert.deepStrictEqual([summary.attempted, summary.accepted, summary.failed], [4, 3, 1]);
    assert.strictEqual(summary.results[1].outcome, 'rejected');
    assert.strictEqual(summary.results[1].ackCode, 'AR');
    assert.strictEqual(server.received.length, 4);
  });
});

test('with stopOnError the run stops at the first message that is not accepted', async () => {
  await withServer({ mode: (n) => (n === 3 ? 'error' : 'accept') }, async (server) => {
    const summary = await run(server, messages(5), { stopOnError: true });
    assert.strictEqual(summary.status, 'stopped');
    assert.deepStrictEqual([summary.attempted, summary.accepted, summary.failed], [3, 2, 1]);
    assert.strictEqual(server.received.length, 3);
  });
});

test('a run can be cancelled during the pause', async () => {
  await withServer({}, async (server) => {
    const controller = new AbortController();
    const pending = run(server, messages(5), { delayMs: 5000, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    const started = Date.now();
    const summary = await pending;
    assert.ok(Date.now() - started < 2000, 'the pause ended at once');
    assert.strictEqual(summary.status, 'cancelled');
    assert.strictEqual(summary.attempted, 1);
    assert.strictEqual(server.received.length, 1);
  });
});

test('a run can be cancelled while a message waits for its ACK', async () => {
  await withServer({ mode: 'silent' }, async (server) => {
    const controller = new AbortController();
    const pending = run(server, messages(3), { replyTimeoutMs: 5000, signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    const summary = await pending;
    assert.strictEqual(summary.status, 'cancelled');
    assert.strictEqual(summary.results.at(-1).outcome, 'cancelled');
    assert.strictEqual(summary.failed, 0, 'a cancelled message is not a failure');
    assert.strictEqual(summary.attempted, 1);
  });
});

test('a run that is cancelled before it starts sends nothing', async () => {
  await withServer({}, async (server) => {
    const controller = new AbortController();
    controller.abort();
    const summary = await run(server, messages(3), { signal: controller.signal });
    assert.strictEqual(summary.status, 'cancelled');
    assert.strictEqual(server.connections, 0);
  });
});

// ------------------------------------------------------------ the connection

test('a connection that the server closes after each reply is opened again, and counted', async () => {
  await withServer({ mode: 'closeAfterReply' }, async (server) => {
    const summary = await run(server, messages(3), { delayMs: 40 });
    assert.strictEqual(summary.status, 'finished');
    assert.strictEqual(summary.accepted, 3);
    assert.strictEqual(server.connections, 3);
    assert.strictEqual(summary.reconnects, 2);
    assert.deepStrictEqual(summary.results.map((item) => item.reconnected), [false, true, true]);
  });
});

test('after a timeout the connection is replaced, so a late ACK cannot be taken for the next one', async () => {
  await withServer({ mode: (n) => (n === 2 ? 'silent' : 'accept') }, async (server) => {
    const summary = await run(server, messages(3), { replyTimeoutMs: 150 });
    assert.deepStrictEqual(summary.results.map((item) => item.outcome), ['accepted', 'reply-timeout', 'accepted']);
    assert.strictEqual(server.connections, 2);
    assert.strictEqual(summary.results[2].reconnected, true);
    assert.strictEqual(summary.status, 'finished');
  });
});

test('a server that cannot be reached stops the run after the first try, whatever stopOnError says', async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  const summary = await sendBatch({ host: '127.0.0.1', port, messages: messages(10), ...FAST, stopOnError: false });
  assert.strictEqual(summary.status, 'connection-failed');
  assert.strictEqual(summary.attempted, 1);
  assert.strictEqual(summary.results[0].outcome, 'connect-failed');
});

test('a server that goes away during the run stops it as soon as it cannot be reached again', async () => {
  const server = await startMockServer({ mode: 'closeAfterReply' });
  const first = sendBatch({ host: server.host, port: server.port, messages: messages(4), ...FAST, delayMs: 100 });
  setTimeout(() => server.close(), 150);
  const summary = await first;
  assert.strictEqual(summary.status, 'connection-failed');
  assert.ok(summary.attempted >= 2 && summary.attempted < 4, String(summary.attempted));
  assert.strictEqual(summary.results.at(-1).outcome, 'connect-failed');
});

test('wrong host or port is reported before anything is tried', async () => {
  for (const options of [{ host: '', port: 2575 }, { host: 'localhost', port: 0 }]) {
    const summary = await sendBatch({ ...options, messages: messages(2), ...FAST });
    assert.strictEqual(summary.status, 'invalid-settings');
    assert.strictEqual(summary.attempted, 0);
    assert.ok(summary.message);
  }
});

test('a message that cannot be encoded fails on its own and the run goes on', async () => {
  await withServer({}, async (server) => {
    const list = [message('E1'), message('E2', '山田'), message('E3')];
    const summary = await run(server, list, { encoding: 'windows-1252' });
    assert.deepStrictEqual(summary.results.map((item) => item.outcome), ['accepted', 'invalid-input', 'accepted']);
    assert.strictEqual(summary.status, 'finished');
    assert.deepStrictEqual([summary.accepted, summary.failed], [2, 1]);
  });
});

// ------------------------------------------------------------ the session

test('a session keeps one connection for many messages and can be closed and used again', async () => {
  await withServer({}, async (server) => {
    const session = new MllpSession({ host: server.host, port: server.port, ...FAST });
    assert.strictEqual(session.connected, false);
    assert.strictEqual((await session.send(message('S1'))).outcome, 'accepted');
    assert.strictEqual(session.connected, true);
    assert.strictEqual((await session.send(message('S2'))).reconnected, false);
    assert.strictEqual(server.connections, 1);
    session.close();
    assert.strictEqual(session.connected, false);
    const again = await session.send(message('S3'));
    assert.strictEqual(again.outcome, 'accepted');
    assert.strictEqual(again.reconnected, true);
    assert.strictEqual(server.connections, 2);
    session.close();
  });
});

test('abortableSleep waits, and stops early when told to', async () => {
  const started = Date.now();
  assert.strictEqual(await abortableSleep(50), true);
  assert.ok(Date.now() - started >= 45);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), 20);
  assert.strictEqual(await abortableSleep(5000, controller.signal), false);
  assert.strictEqual(await abortableSleep(5000, AbortSignal.abort()), false);
});

// ------------------------------------------------------------ requests from the window

const REQUEST = { requestId: 'req-1', host: 'srv', port: '2575', messages: ['MSH|a', 'MSH|b'], encoding: 'windows-1252', connectTimeoutSeconds: '5', replyTimeoutSeconds: 20, delaySeconds: '60', stopOnError: true };

test('a request from the window is turned into options, with seconds as milliseconds', () => {
  assert.deepStrictEqual(cleanBatchRequest(REQUEST), {
    requestId: 'req-1',
    options: { messages: ['MSH|a', 'MSH|b'], host: 'srv', port: '2575', encoding: 'windows-1252', connectTimeoutMs: 5000, replyTimeoutMs: 20000, delayMs: 60000, stopOnError: true },
  });
});

test('the delay can be zero, is limited to an hour, and falls back to a minute when it makes no sense', () => {
  const delay = (value) => cleanBatchRequest({ ...REQUEST, delaySeconds: value }).options.delayMs;
  assert.strictEqual(delay(0), 0);
  assert.strictEqual(delay('0'), 0);
  assert.strictEqual(delay(2.5), 2500);
  assert.strictEqual(delay(999999), 3_600_000);
  for (const bad of ['', 'abc', -1, null, undefined, Number.NaN]) assert.strictEqual(delay(bad), DEFAULT_DELAY_SECONDS * 1000, String(bad));
});

test('stopOnError is only true when it is true, and an unknown encoding becomes UTF-8', () => {
  assert.strictEqual(cleanBatchRequest({ ...REQUEST, stopOnError: 'yes' }).options.stopOnError, false);
  assert.strictEqual(cleanBatchRequest({ ...REQUEST, stopOnError: undefined }).options.stopOnError, false);
  assert.strictEqual(cleanBatchRequest({ ...REQUEST, encoding: 'latin-9' }).options.encoding, 'utf-8');
});

test('requests that are not valid are refused', () => {
  const refused = [
    [null, /not valid/], ['x', /not valid/], [[], /not valid/],
    [{ ...REQUEST, requestId: undefined }, /ID/], [{ ...REQUEST, requestId: 'a b' }, /ID/],
    [{ ...REQUEST, messages: undefined }, /no messages/], [{ ...REQUEST, messages: [] }, /no messages/], [{ ...REQUEST, messages: 'MSH|a' }, /no messages/],
    [{ ...REQUEST, messages: ['MSH|a', 5] }, /must be text/], [{ ...REQUEST, messages: ['MSH|a', '  '] }, /must be text/],
    [{ ...REQUEST, messages: Array.from({ length: MAX_MESSAGES + 1 }, () => 'MSH|a') }, /At most/],
    [{ ...REQUEST, messages: ['x'.repeat(60 * 1024 * 1024), 'x'.repeat(60 * 1024 * 1024)] }, /too large/],
  ];
  for (const [payload, pattern] of refused) assert.match(cleanBatchRequest(payload).error, pattern, JSON.stringify(payload)?.slice(0, 60));
});

test('host and port of the wrong type do not get through', () => {
  const { options } = cleanBatchRequest({ ...REQUEST, host: { x: 1 }, port: { y: 2 } });
  assert.strictEqual(options.host, '');
  assert.strictEqual(options.port, '');
});
