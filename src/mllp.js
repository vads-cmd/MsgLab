'use strict';

/**
 * MLLP, the usual way to move HL7 v2 messages over TCP.
 *
 *   frame:  <VT> message <FS><CR>      (0x0B ... 0x1C 0x0D)
 *
 * This file knows how to frame a message, read a framed reply, understand an ACK and
 * send one message. It does not touch the window; main.js calls it.
 */

const net = require('node:net');
const { encodeText, decodeBuffer } = require('./files');
const { parseMessage, get } = require('./hl7/parser');

const VT = 0x0b;
const FS = 0x1c;
const CR = 0x0d;

const MAX_FRAME_BYTES = 10 * 1024 * 1024;
const MAX_LOG_BYTES = 4096;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_REPLY_TIMEOUT_MS = 30_000;

/** MSA-1 acknowledgment codes: original mode (AA, AE, AR) and enhanced mode (CA, CE, CR). */
const ACK_LEVELS = Object.freeze({ AA: 'accepted', CA: 'accepted', AE: 'error', CE: 'error', AR: 'rejected', CR: 'rejected' });

const OUTCOME_FOR_LEVEL = Object.freeze({ accepted: 'accepted', error: 'application-error', rejected: 'rejected', unknown: 'invalid-ack' });

const NETWORK_HINTS = Object.freeze({
  ECONNREFUSED: 'Nothing is listening on that port, or a firewall refused the connection.',
  ENOTFOUND: 'The host name could not be found.',
  EAI_AGAIN: 'The host name could not be looked up right now.',
  EHOSTUNREACH: 'The host cannot be reached from this computer.',
  ENETUNREACH: 'The network cannot be reached from this computer.',
  ETIMEDOUT: 'The connection timed out.',
  ECONNRESET: 'The server reset the connection.',
  EPIPE: 'The server closed the connection while the message was being sent.',
});

// ---------------------------------------------------------------- framing

/** The message as it goes on the wire: segments separated by CR, a CR after the last one, no framing bytes inside. */
function toWireText(text) {
  const clean = String(text ?? '').replaceAll('\x0b', '').replaceAll('\x1c', '');
  const lines = clean.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  return lines.length > 0 ? `${lines.join('\r')}\r` : '';
}

/** One message in an MLLP frame, as bytes. Throws when a character does not fit the chosen encoding. */
function frameMessage(text, encoding = 'utf-8') {
  const body = encodeText(toWireText(text), encoding);
  return Buffer.concat([Buffer.from([VT]), body, Buffer.from([FS, CR])]);
}

/**
 * Collects the bytes a server sends and hands out complete frames. A frame may arrive in many
 * pieces, and many frames may arrive in one piece. Bytes outside a frame are counted, not kept.
 */
class FrameReader {
  constructor(maxBytes = MAX_FRAME_BYTES) {
    this.maxBytes = maxBytes;
    this.buffer = Buffer.alloc(0);
    this.strayBytes = 0;
  }

  /** Bytes of a frame that has started but not ended yet. */
  get pendingBytes() {
    return this.buffer.length;
  }

  /** Add bytes; returns the complete frames now available (without the framing bytes). */
  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames = [];
    for (;;) {
      const start = this.buffer.indexOf(VT);
      if (start === -1) {
        this.strayBytes += this.buffer.length;
        this.buffer = Buffer.alloc(0);
        break;
      }
      this.strayBytes += start;
      this.buffer = this.buffer.subarray(start);
      const end = this.buffer.indexOf(FS, 1);
      if (end === -1) {
        if (this.buffer.length > this.maxBytes) throw new Error(`The reply is larger than ${this.maxBytes} bytes without an end of frame.`);
        break;
      }
      frames.push(this.buffer.subarray(1, end));
      this.buffer = this.buffer.subarray(end + 1);
    }
    return frames;
  }
}

// ---------------------------------------------------------------- reading an ACK

function fieldOf(segment, number) {
  return segment?.fields?.[number]?.raw ?? '';
}

/** What an ACK says: code (MSA-1), the message it answers (MSA-2), text (MSA-3) and any ERR segments. */
function parseAck(text) {
  const msg = parseMessage(text);
  const msa = msg.segments.find((segment) => segment.name === 'MSA');
  const code = fieldOf(msa, 1).trim().toUpperCase();
  return {
    hasMsa: msa !== undefined,
    code,
    level: ACK_LEVELS[code] ?? 'unknown',
    controlId: fieldOf(msa, 2).trim(),
    text: fieldOf(msa, 3),
    errors: msg.segments.filter((segment) => segment.name === 'ERR').map((segment) => segment.raw),
    messageType: get(msg, 'MSH-9'),
  };
}

// ---------------------------------------------------------------- what the user sees of raw bytes

/** Bytes as text where the framing bytes are visible: <VT>, <FS> and <CR> (each CR also starts a new line). */
function visibleText(buffer) {
  return buffer
    .toString('latin1')
    .replaceAll('\x0b', '<VT>')
    .replaceAll('\x1c', '<FS>')
    .replaceAll('\r', '<CR>\n');
}

function hexDump(buffer) {
  return buffer.toString('hex').replaceAll(/(..)/g, '$1 ').trim();
}

function describeReply(buffer) {
  return { bytes: buffer.length, hex: hexDump(buffer), visible: visibleText(buffer) };
}

// ---------------------------------------------------------------- checking the target

/** A clean { host, port } or { error } to show. IPv6 addresses may be written in brackets. */
function validateTarget({ host, port } = {}) {
  const name = String(host ?? '').trim().replace(/^\[(.*)\]$/, '$1');
  if (name === '') return { error: 'Enter the host name or IP address of the server.' };
  if (name.length > 253 || !/^[\w.:%-]+$/.test(name)) return { error: 'The host name contains characters that are not allowed.' };
  const number = typeof port === 'string' ? Number(port.trim()) : port;
  if (!Number.isInteger(number) || number < 1 || number > 65535) return { error: 'The port must be a whole number from 1 to 65535.' };
  return { host: name, port: number };
}

// ---------------------------------------------------------------- sending

const milliseconds = (since) => Math.round(performance.now() - since);

function networkMessage(error, host, port, connected) {
  const what = connected ? `The connection to ${host}:${port} failed` : `Could not connect to ${host}:${port}`;
  const hint = NETWORK_HINTS[error.code] ?? '';
  const advice = hint === '' ? '' : ` ${hint}`;
  return `${what} (${error.code ?? error.message}).${advice}`;
}

function describeAck(ack, ms) {
  const note = ack.text ? ` ${ack.text}` : '';
  switch (ack.level) {
    case 'accepted':
      return `ACK ${ack.code}: the message was accepted (${ms} ms).${note}`;
    case 'error':
      return `ACK ${ack.code}: the server could not process the message.${note}`;
    case 'rejected':
      return `ACK ${ack.code}: the server rejected the message.${note}`;
    default:
      return ack.hasMsa
        ? `The reply has an unknown acknowledgment code "${ack.code}" in MSA-1.`
        : 'The reply is framed correctly but has no MSA segment, so it is not an ACK.';
  }
}

function checkInput(options) {
  const target = validateTarget(options);
  if (target.error) return target;
  const wire = toWireText(options.message);
  if (wire === '') return { error: 'There is no message to send.' };
  let frame;
  try {
    frame = frameMessage(options.message, options.encoding ?? 'utf-8');
  } catch (error) {
    return { error: error.message };
  }
  const sent = parseMessage(wire);
  return { ...target, frame, sentControlId: get(sent, 'MSH-10').trim() };
}

const positive = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);

/**
 * Open a connection, send one message, wait for the ACK, close. Always resolves; never throws for
 * network problems. The result says what happened:
 *
 *   { ok, outcome, message, host, port, bytesSent, connectMs, totalMs, reply, ack?, ackText?, warnings, code? }
 *
 *   outcome: accepted | application-error | rejected | invalid-ack | not-framed | connect-failed |
 *            connect-timeout | reply-timeout | closed | cancelled | invalid-input
 *
 * options: host, port, message, encoding ('utf-8' | 'windows-1252'), connectTimeoutMs,
 *          replyTimeoutMs, signal (AbortSignal)
 */
function sendMessage(options = {}) {
  const input = checkInput(options);
  if (input.error) {
    return Promise.resolve({ ok: false, outcome: 'invalid-input', message: input.error, warnings: [] });
  }
  const { host, port, frame, sentControlId } = input;
  const connectTimeoutMs = positive(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS);
  const replyTimeoutMs = positive(options.replyTimeoutMs, DEFAULT_REPLY_TIMEOUT_MS);

  return new Promise((resolve) => {
    const started = performance.now();
    const reader = new FrameReader();
    const received = [];
    let receivedBytes = 0;
    let connectMs = null;
    let settled = false;
    let connectTimer = null;
    let replyTimer = null;
    const socket = new net.Socket();

    const onAbort = () => finish('cancelled', 'Sending was cancelled.');

    function finish(outcome, message, extra = {}) {
      if (settled) return;
      settled = true;
      clearTimeout(connectTimer);
      clearTimeout(replyTimer);
      options.signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      const raw = Buffer.concat(received).subarray(0, MAX_LOG_BYTES);
      resolve({
        ok: outcome === 'accepted',
        outcome,
        message,
        host,
        port,
        bytesSent: frame.length,
        connectMs,
        totalMs: milliseconds(started),
        reply: describeReply(raw),
        warnings: [],
        ...extra,
      });
    }

    function onFrame(payload) {
      const { text } = decodeBuffer(payload);
      const ack = parseAck(text);
      const warnings = [];
      if (sentControlId && ack.controlId && ack.controlId !== sentControlId) {
        warnings.push(`The ACK answers message ${ack.controlId}, but the message sent has control ID ${sentControlId}.`);
      }
      finish(OUTCOME_FOR_LEVEL[ack.level], describeAck(ack, milliseconds(started)), { ack, ackText: text, warnings });
    }

    const answeredWithoutFraming = () => receivedBytes > 0 && receivedBytes === reader.strayBytes;
    const NOT_FRAMED = 'The server answered, but not in MLLP framing (the reply does not start with the <VT> byte).';

    function onClosed() {
      if (settled) return;
      if (answeredWithoutFraming()) {
        finish('not-framed', NOT_FRAMED);
      } else if (receivedBytes > 0) {
        finish('closed', 'The server closed the connection in the middle of its reply.');
      } else {
        finish('closed', 'The server closed the connection without sending an ACK.');
      }
    }

    if (options.signal?.aborted) {
      finish('cancelled', 'Sending was cancelled.');
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });

    socket.setNoDelay(true);
    connectTimer = setTimeout(() => {
      finish('connect-timeout', `No connection to ${host}:${port} within ${Math.round(connectTimeoutMs / 1000)} seconds.`);
    }, connectTimeoutMs);

    socket.once('connect', () => {
      clearTimeout(connectTimer);
      connectMs = milliseconds(started);
      socket.write(frame, () => {
        if (settled) return;
        replyTimer = setTimeout(() => {
          if (answeredWithoutFraming()) {
            finish('not-framed', NOT_FRAMED);
            return;
          }
          finish('reply-timeout', `Connected and sent ${frame.length} bytes, but no ACK arrived within ${Math.round(replyTimeoutMs / 1000)} seconds.`);
        }, replyTimeoutMs);
      });
    });

    socket.on('data', (chunk) => {
      if (settled) return;
      receivedBytes += chunk.length;
      if (received.length === 0 || Buffer.concat(received).length < MAX_LOG_BYTES) received.push(chunk);
      let frames;
      try {
        frames = reader.push(chunk);
      } catch (error) {
        finish('invalid-ack', error.message);
        return;
      }
      if (frames.length > 0) onFrame(frames[0]);
    });

    socket.on('error', (error) => {
      const connected = connectMs !== null;
      finish(connected ? 'closed' : 'connect-failed', networkMessage(error, host, port, connected), { code: error.code });
    });
    socket.on('close', onClosed);

    socket.connect(port, host);
  });
}

/**
 * Only try to connect: no message is sent. Always resolves.
 *
 *   { ok, outcome, message, host, port, connectMs, code? }
 *   outcome: reachable | connect-failed | connect-timeout | cancelled | invalid-input
 *
 * options: host, port, connectTimeoutMs, signal (AbortSignal)
 */
function testConnection(options = {}) {
  const target = validateTarget(options);
  if (target.error) return Promise.resolve({ ok: false, outcome: 'invalid-input', message: target.error });
  const { host, port } = target;
  const timeoutMs = positive(options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS);

  return new Promise((resolve) => {
    const started = performance.now();
    const socket = new net.Socket();
    let settled = false;
    let timer = null;
    const onAbort = () => finish('cancelled', 'The connection test was cancelled.');

    function finish(outcome, message, extra = {}) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      socket.destroy();
      resolve({ ok: outcome === 'reachable', outcome, message, host, port, connectMs: milliseconds(started), ...extra });
    }

    if (options.signal?.aborted) {
      finish('cancelled', 'The connection test was cancelled.');
      return;
    }
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish('connect-timeout', `No connection to ${host}:${port} within ${Math.round(timeoutMs / 1000)} seconds.`), timeoutMs);
    socket.once('connect', () => {
      finish('reachable', `${host}:${port} accepts connections (${milliseconds(started)} ms). Nothing was sent, so this does not show that the server understands HL7.`);
    });
    socket.once('error', (error) => finish('connect-failed', networkMessage(error, host, port, false), { code: error.code }));
    socket.connect(port, host);
  });
}

// ---------------------------------------------------------------- requests from the window

const MAX_MESSAGE_CHARS = 5 * 1024 * 1024;
const MAX_TIMEOUT_SECONDS = 600;
const REQUEST_ENCODINGS = new Set(['utf-8', 'windows-1252']);

function timeoutFrom(seconds, fallbackMs) {
  const value = typeof seconds === 'string' ? Number(seconds) : seconds;
  if (!Number.isFinite(value) || value <= 0) return fallbackMs;
  return Math.round(Math.min(value, MAX_TIMEOUT_SECONDS) * 1000);
}

/**
 * Turns what the window sends into options for sendMessage or testConnection, or an { error }.
 * Timeouts arrive in seconds, are limited to 10 minutes and fall back to the defaults.
 */
function cleanRequest(payload, { needsMessage }) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'The request is not valid.' };
  const requestId = String(payload.requestId ?? '');
  if (!/^[\w-]{1,64}$/.test(requestId)) return { error: 'The request has no valid ID.' };
  const options = {
    host: typeof payload.host === 'string' ? payload.host : '',
    port: typeof payload.port === 'number' || typeof payload.port === 'string' ? payload.port : '',
    connectTimeoutMs: timeoutFrom(payload.connectTimeoutSeconds, DEFAULT_CONNECT_TIMEOUT_MS),
  };
  if (needsMessage) {
    if (typeof payload.message !== 'string') return { error: 'There is no message to send.' };
    if (payload.message.length > MAX_MESSAGE_CHARS) return { error: 'The message is too large to send.' };
    options.message = payload.message;
    options.replyTimeoutMs = timeoutFrom(payload.replyTimeoutSeconds, DEFAULT_REPLY_TIMEOUT_MS);
    options.encoding = REQUEST_ENCODINGS.has(payload.encoding) ? payload.encoding : 'utf-8';
  }
  return { requestId, options };
}

module.exports = {
  frameMessage, toWireText, FrameReader, parseAck, validateTarget, sendMessage, testConnection, cleanRequest, visibleText, hexDump,
  MAX_FRAME_BYTES, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_REPLY_TIMEOUT_MS,
};
