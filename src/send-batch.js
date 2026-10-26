'use strict';

/**
 * Sends a list of messages to one MLLP server on one connection, one after the other, with a
 * pause between them. The window shows the progress; this file knows nothing about the window.
 */

const { MllpSession, validateTarget } = require('./mllp');
const { parseMessage, get } = require('./hl7/parser');

const MAX_MESSAGES = 5000;
const MAX_TOTAL_CHARS = 100 * 1024 * 1024;
const MAX_DELAY_SECONDS = 3600;
const DEFAULT_DELAY_SECONDS = 60;

/** Outcomes that say the server cannot be reached at all: going on would only repeat the failure. */
const CONNECTION_OUTCOMES = new Set(['connect-failed', 'connect-timeout']);

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

/** One line of the result list: what was sent, and how it went. */
function describeSend(index, text, result) {
  const sent = parseMessage(text);
  return {
    number: index + 1,
    type: get(sent, 'MSH-9'),
    controlId: get(sent, 'MSH-10').trim(),
    ok: result.ok,
    outcome: result.outcome,
    ackCode: result.ack?.code ?? '',
    message: result.message,
    ms: result.totalMs ?? 0,
    reconnected: result.reconnected === true,
    sentAt: new Date().toISOString(),
  };
}

function statusFor(record, stopOnError) {
  if (record.outcome === 'cancelled') return 'cancelled';
  if (CONNECTION_OUTCOMES.has(record.outcome)) return 'connection-failed';
  if (!record.ok && stopOnError) return 'stopped';
  return null;
}

/**
 * options: messages (array of text), host, port, encoding, connectTimeoutMs, replyTimeoutMs,
 *          delayMs (pause between two messages), stopOnError, signal (AbortSignal),
 *          onProgress (called after each message and before each pause), sleep (for tests)
 *
 * Always resolves with
 *   { status, total, attempted, accepted, failed, reconnects, results[] }
 *   status: finished | stopped (a message was not accepted, stopOnError) | cancelled | connection-failed |
 *           invalid-settings (host or port wrong; nothing was tried, and `message` says what is wrong)
 *
 * A message that is not accepted does not stop the run, unless stopOnError is set. A connection
 * that cannot be opened stops it always. A connection that the server closed between two
 * messages is opened again.
 */
async function sendBatch(options) {
  const { messages, delayMs = 0, stopOnError = false, signal, onProgress = () => {}, sleep = abortableSleep } = options;
  const target = validateTarget(options);
  if (target.error) return { status: 'invalid-settings', message: target.error, total: messages.length, attempted: 0, accepted: 0, failed: 0, reconnects: 0, results: [] };
  const session = new MllpSession(options);
  const results = [];
  let status = 'finished';
  try {
    for (let index = 0; index < messages.length; index += 1) {
      const result = await session.send(messages[index], { signal });
      const record = describeSend(index, messages[index], result);
      results.push(record);
      const accepted = results.filter((item) => item.ok).length;
      onProgress({ kind: 'sent', total: messages.length, done: results.length, accepted, failed: results.length - accepted, record });
      const stop = statusFor(record, stopOnError);
      if (stop) {
        status = stop;
        break;
      }
      if (index < messages.length - 1 && delayMs > 0) {
        onProgress({ kind: 'waiting', total: messages.length, done: results.length, nextAt: Date.now() + delayMs });
        if (!(await sleep(delayMs, signal))) {
          status = 'cancelled';
          break;
        }
      }
    }
  } finally {
    session.close();
  }
  const accepted = results.filter((item) => item.ok).length;
  return {
    status,
    total: messages.length,
    attempted: results.length,
    accepted,
    failed: results.filter((item) => !item.ok && item.outcome !== 'cancelled').length,
    reconnects: session.reconnects,
    results,
  };
}

// ---------------------------------------------------------------- requests from the window

const timeoutOf = (seconds) => {
  const value = typeof seconds === 'string' ? Number(seconds) : seconds;
  return Number.isFinite(value) && value > 0 ? Math.round(Math.min(value, 600) * 1000) : undefined;
};

function delayOf(seconds) {
  const value = typeof seconds === 'string' && seconds.trim() !== '' ? Number(seconds) : seconds;
  if (!Number.isFinite(value) || value < 0) return DEFAULT_DELAY_SECONDS * 1000;
  return Math.round(Math.min(value, MAX_DELAY_SECONDS) * 1000);
}

/** Turns what the window sends into options for sendBatch, or an { error }. */
function cleanBatchRequest(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'The request is not valid.' };
  const requestId = String(payload.requestId ?? '');
  if (!/^[\w-]{1,64}$/.test(requestId)) return { error: 'The request has no valid ID.' };
  const { messages } = payload;
  if (!Array.isArray(messages) || messages.length === 0) return { error: 'There are no messages to send.' };
  if (messages.length > MAX_MESSAGES) return { error: `At most ${MAX_MESSAGES} messages can be sent in one run.` };
  if (!messages.every((text) => typeof text === 'string' && text.trim() !== '')) return { error: 'Every message must be text, and not empty.' };
  if (messages.reduce((sum, text) => sum + text.length, 0) > MAX_TOTAL_CHARS) return { error: 'The messages are too large to send in one run.' };
  return {
    requestId,
    options: {
      messages,
      host: typeof payload.host === 'string' ? payload.host : '',
      port: typeof payload.port === 'number' || typeof payload.port === 'string' ? payload.port : '',
      encoding: payload.encoding === 'windows-1252' ? 'windows-1252' : 'utf-8',
      connectTimeoutMs: timeoutOf(payload.connectTimeoutSeconds),
      replyTimeoutMs: timeoutOf(payload.replyTimeoutSeconds),
      delayMs: delayOf(payload.delaySeconds),
      stopOnError: payload.stopOnError === true,
    },
  };
}

module.exports = { sendBatch, cleanBatchRequest, abortableSleep, MAX_MESSAGES, MAX_DELAY_SECONDS, DEFAULT_DELAY_SECONDS };
