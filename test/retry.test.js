'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { sendWithRetry, cleanRetry, shouldRetry, MAX_RETRIES } = require('../src/retry');

const ok = { ok: true, outcome: 'accepted', message: 'Accepted.' };
const failed = (outcome) => ({ ok: false, outcome, message: `Failed: ${outcome}.` });

/** An attempt() that gives the listed results one after the other, and counts its calls. */
function attempts(results) {
  const state = { calls: 0 };
  state.run = async () => results[Math.min(state.calls++, results.length - 1)];
  return state;
}
const instantly = async () => true;

test('retry settings: whole tries from 0 to the maximum; anything else is 0', () => {
  assert.deepStrictEqual(cleanRetry({ retries: '3', retryOnNack: true }), { retries: 3, retryOnNack: true });
  assert.strictEqual(cleanRetry({ retries: 2 }).retries, 2);
  assert.strictEqual(cleanRetry({ retries: 99 }).retries, MAX_RETRIES);
  assert.strictEqual(cleanRetry({ retries: -1 }).retries, 0);
  for (const bad of ['', 'abc', 1.5, null, undefined]) assert.strictEqual(cleanRetry({ retries: bad }).retries, 0, String(bad));
  assert.strictEqual(cleanRetry(undefined).retries, 0);
  assert.strictEqual(cleanRetry({ retryOnNack: 'true' }).retryOnNack, false);
});

test('only the cases where the server did not answer are retried; AE and AR need retryOnNack', () => {
  for (const outcome of ['connect-failed', 'connect-timeout', 'reply-timeout', 'closed']) assert.strictEqual(shouldRetry(failed(outcome), false), true, outcome);
  for (const outcome of ['application-error', 'rejected']) {
    assert.strictEqual(shouldRetry(failed(outcome), false), false, outcome);
    assert.strictEqual(shouldRetry(failed(outcome), true), true, outcome);
  }
  for (const outcome of ['cancelled', 'invalid-input', 'invalid-ack', 'not-framed']) assert.strictEqual(shouldRetry(failed(outcome), true), false, outcome);
  assert.strictEqual(shouldRetry(ok, true), false);
});

test('with no retries a failure is returned after one try, unchanged apart from attempts', async () => {
  const run = attempts([failed('reply-timeout')]);
  const result = await sendWithRetry(run.run, { retries: 0, sleep: instantly });
  assert.strictEqual(run.calls, 1);
  assert.strictEqual(result.attempts, 1);
  assert.strictEqual(result.message, 'Failed: reply-timeout.');
});

test('it tries again until the send works, and says how many tries it took', async () => {
  const run = attempts([failed('connect-failed'), failed('closed'), ok]);
  const seen = [];
  const result = await sendWithRetry(run.run, { retries: 3, sleep: instantly, onRetry: ({ attempt, of }) => seen.push([attempt, of]) });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.attempts, 3);
  assert.strictEqual(result.message, 'Accepted. (tried 3 times)');
  assert.deepStrictEqual(seen, [[2, 4], [3, 4]]);
});

test('it gives up after the last allowed try', async () => {
  const run = attempts([failed('reply-timeout')]);
  const result = await sendWithRetry(run.run, { retries: 2, sleep: instantly });
  assert.strictEqual(run.calls, 3);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.attempts, 3);
});

test('a refusal is final unless retryOnNack is set', async () => {
  const once = attempts([failed('rejected'), ok]);
  assert.strictEqual((await sendWithRetry(once.run, { retries: 2, sleep: instantly })).outcome, 'rejected');
  assert.strictEqual(once.calls, 1);
  const twice = attempts([failed('rejected'), ok]);
  assert.strictEqual((await sendWithRetry(twice.run, { retries: 2, retryOnNack: true, sleep: instantly })).ok, true);
  assert.strictEqual(twice.calls, 2);
});

test('Cancel during the pause ends the send as cancelled, without another try', async () => {
  const run = attempts([failed('reply-timeout'), ok]);
  const result = await sendWithRetry(run.run, { retries: 2, sleep: async () => false });
  assert.strictEqual(run.calls, 1);
  assert.strictEqual(result.outcome, 'cancelled');
  assert.strictEqual(result.ok, false);
});

test('a cancelled signal stops the retrying', async () => {
  const run = attempts([failed('reply-timeout'), ok]);
  const result = await sendWithRetry(run.run, { retries: 2, sleep: instantly, signal: AbortSignal.abort() });
  assert.strictEqual(run.calls, 1);
  assert.strictEqual(result.attempts, 1);
});
