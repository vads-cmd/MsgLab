'use strict';

/**
 * Trying a send again. Only the cases where the server did not answer are retried (the connection
 * could not be opened, no ACK came, the server hung up). When the server did answer with AE or AR,
 * the message is retried only if the person asked for it: a refused message may already be stored
 * on the other side, and sending it again can make a duplicate.
 */

const MAX_RETRIES = 5;
const RETRY_PAUSE_MS = 2000;

const NO_ANSWER = new Set(['connect-failed', 'connect-timeout', 'reply-timeout', 'closed']);
const REFUSED = new Set(['application-error', 'rejected']);

/** Waits; resolves false when the signal stops the wait early, true when the time has passed. */
function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Reads the retry settings of a request from the window: { retries (0 to MAX_RETRIES), retryOnNack }. */
function cleanRetry(payload) {
  const raw = typeof payload?.retries === 'string' && payload.retries.trim() !== '' ? Number(payload.retries) : payload?.retries;
  const retries = Number.isInteger(raw) ? Math.min(Math.max(raw, 0), MAX_RETRIES) : 0;
  return { retries, retryOnNack: payload?.retryOnNack === true };
}

function shouldRetry(result, retryOnNack) {
  if (result.ok) return false;
  return NO_ANSWER.has(result.outcome) || (retryOnNack && REFUSED.has(result.outcome));
}

/**
 * Runs attempt() (which resolves with a send result) and runs it again while the result calls for it,
 * at most `retries` more times, with a pause in between. Resolves with the last result, plus
 * `attempts`; after more than one try the message says how many were made.
 *
 * options: retries, retryOnNack, signal (AbortSignal; Cancel also ends the pause), pauseMs,
 *          onRetry({ attempt, of, result }) before each new try, sleep (for tests)
 */
async function sendWithRetry(attempt, options = {}) {
  const { retries = 0, retryOnNack = false, signal, pauseMs = RETRY_PAUSE_MS, onRetry = () => {}, sleep = abortableSleep } = options;

  const finish = (result, attempts) => (attempts === 1
    ? { ...result, attempts }
    : { ...result, attempts, message: `${result.message} (tried ${attempts} times)` });

  // each further try is a step of its own (they must follow one another, so this is a chain and not a loop)
  const next = async (result, attempts) => {
    if (attempts > retries || !shouldRetry(result, retryOnNack) || signal?.aborted) return finish(result, attempts);
    onRetry({ attempt: attempts + 1, of: retries + 1, result });
    if (!(await sleep(pauseMs, signal))) {
      return { ...result, ok: false, outcome: 'cancelled', message: 'Sending was cancelled.', attempts };
    }
    return next(await attempt(), attempts + 1);
  };

  return next(await attempt(), 1);
}

module.exports = { sendWithRetry, cleanRetry, shouldRetry, abortableSleep, MAX_RETRIES, RETRY_PAUSE_MS };
