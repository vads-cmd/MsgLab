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

/** Opens a TCP connection. Resolves { socket } or { error: { outcome, message, code? } }. */
function openConnection({ host, port, connectTimeoutMs, signal }) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    let timer = null;
    const onAbort = () => finish({ outcome: 'cancelled', message: 'Sending was cancelled.' });
    function finish(error) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (error) socket.destroy();
      resolve(error ? { error } : { socket });
    }
    timer = setTimeout(() => {
      finish({ outcome: 'connect-timeout', message: `No connection to ${host}:${port} within ${Math.round(connectTimeoutMs / 1000)} seconds.` });
    }, connectTimeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    socket.setNoDelay(true);
    socket.once('connect', () => finish(null));
    socket.once('error', (error) => finish({ outcome: 'connect-failed', message: networkMessage(error, host, port, false), code: error.code }));
    socket.connect(port, host);
  });
}

const NOT_FRAMED = 'The server answered, but not in MLLP framing (the reply does not start with the <VT> byte).';

/**
 * A connection to one MLLP server that can carry many messages, one after the other. The
 * connection is opened when the first message is sent and kept open. When the server has
 * closed it in the meantime it is opened again, and the result says so (reconnected: true).
 * After a timeout, a cancel or a broken reply the connection is closed, so that a late ACK
 * can never be taken for the ACK of the next message.
 *
 * options: host, port, encoding, connectTimeoutMs, replyTimeoutMs
 */
class MllpSession {
  constructor(options = {}) {
    this.options = options;
    this.socket = null;
    this.reader = null;
    this.exchange = null;
    this.hadConnection = false;
    this.idleNoise = false;
    this.reconnects = 0;
  }

  get connected() {
    return this.socket !== null && !this.socket.destroyed;
  }

  /** Closes the connection; the session can still be used, it connects again. */
  close() {
    const socket = this.socket;
    this.socket = null;
    this.reader = null;
    if (socket) {
      socket.removeAllListeners();
      socket.on('error', () => {});
      socket.destroy();
    }
  }

  attach(socket) {
    this.socket = socket;
    this.reader = new FrameReader();
    socket.on('data', (chunk) => this.onData(socket, chunk));
    socket.on('error', (error) => this.onGone(socket, error));
    socket.on('close', () => this.onGone(socket, null));
  }

  onData(socket, chunk) {
    if (socket !== this.socket) return;
    if (this.exchange) {
      this.exchange.onData(chunk);
      return;
    }
    this.idleNoise = true; // bytes nobody asked for: do not trust this connection for the next message
  }

  onGone(socket, error) {
    if (socket !== this.socket) return;
    this.socket = null;
    socket.destroy();
    this.exchange?.onGone(error);
  }

  /**
   * Sends one message and waits for its ACK. Always resolves; the result has the shape documented at sendMessage.
   * options: signal (AbortSignal)
   */
  async send(message, { signal } = {}) {
    const input = checkInput({ ...this.options, message });
    if (input.error) return { ok: false, outcome: 'invalid-input', message: input.error, warnings: [] };
    const started = performance.now();
    if (signal?.aborted) return this.noExchange(input, started, { outcome: 'cancelled', message: 'Sending was cancelled.' });
    if (this.idleNoise) {
      this.close();
      this.idleNoise = false;
    }
    let connectMs = null;
    const reconnected = !this.connected && this.hadConnection;
    if (!this.connected) {
      const opened = await openConnection({ host: input.host, port: input.port, signal, connectTimeoutMs: positive(this.options.connectTimeoutMs, DEFAULT_CONNECT_TIMEOUT_MS) });
      if (opened.error) return this.noExchange(input, started, opened.error);
      this.attach(opened.socket);
      connectMs = milliseconds(started);
      this.hadConnection = true;
      if (reconnected) this.reconnects += 1;
    }
    return this.runExchange(input, { signal, started, connectMs, reconnected });
  }

  noExchange(input, started, error) {
    return {
      ok: false, outcome: error.outcome, message: error.message, host: input.host, port: input.port, bytesSent: input.frame.length,
      connectMs: null, totalMs: milliseconds(started), reply: describeReply(Buffer.alloc(0)), warnings: [], reconnected: false,
      ...(error.code ? { code: error.code } : {}),
    };
  }

  runExchange(input, { signal, started, connectMs, reconnected }) {
    const { frame, sentControlId, host, port } = input;
    const replyTimeoutMs = positive(this.options.replyTimeoutMs, DEFAULT_REPLY_TIMEOUT_MS);
    const socket = this.socket;
    const reader = this.reader;
    const strayBefore = reader.strayBytes;
    const received = [];
    let loggedBytes = 0;
    let receivedBytes = 0;
    let settled = false;
    let timer = null;

    const withoutFraming = () => receivedBytes > 0 && reader.strayBytes - strayBefore === receivedBytes;

    return new Promise((resolve) => {
      const onAbort = () => finish('cancelled', 'Sending was cancelled.');
      const finish = (outcome, message, extra = {}, keepConnection = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        this.exchange = null;
        if (!keepConnection) this.close();
        resolve({
          ok: outcome === 'accepted', outcome, message, host, port, bytesSent: frame.length, connectMs, reconnected,
          totalMs: milliseconds(started), reply: describeReply(Buffer.concat(received).subarray(0, MAX_LOG_BYTES)), warnings: [], ...extra,
        });
      };

      const onFrame = (payload) => {
        const { text } = decodeBuffer(payload);
        const ack = parseAck(text);
        const warnings = [];
        if (sentControlId && ack.controlId && ack.controlId !== sentControlId) {
          warnings.push(`The ACK answers message ${ack.controlId}, but the message sent has control ID ${sentControlId}.`);
        }
        finish(OUTCOME_FOR_LEVEL[ack.level], describeAck(ack, milliseconds(started)), { ack, ackText: text, warnings }, ack.level !== 'unknown');
      };

      this.exchange = {
        onData: (chunk) => {
          receivedBytes += chunk.length;
          if (loggedBytes < MAX_LOG_BYTES) {
            received.push(chunk);
            loggedBytes += chunk.length;
          }
          let frames;
          try {
            frames = reader.push(chunk);
          } catch (error) {
            finish('invalid-ack', error.message);
            return;
          }
          if (frames.length > 0) onFrame(frames[0]);
        },
        onGone: (error) => {
          if (error) finish('closed', networkMessage(error, host, port, true), { code: error.code });
          else if (withoutFraming()) finish('not-framed', NOT_FRAMED);
          else if (receivedBytes > 0) finish('closed', 'The server closed the connection in the middle of its reply.');
          else finish('closed', 'The server closed the connection without sending an ACK.');
        },
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      socket.write(frame, () => {
        if (settled) return;
        timer = setTimeout(() => {
          if (withoutFraming()) finish('not-framed', NOT_FRAMED);
          else finish('reply-timeout', `Connected and sent ${frame.length} bytes, but no ACK arrived within ${Math.round(replyTimeoutMs / 1000)} seconds.`);
        }, replyTimeoutMs);
      });
    });
  }
}

/**
 * Open a connection, send one message, wait for the ACK, close. Always resolves; never throws for
 * network problems. The result says what happened:
 *
 *   { ok, outcome, message, host, port, bytesSent, connectMs, totalMs, reply, ack?, ackText?, warnings, reconnected, code? }
 *
 *   outcome: accepted | application-error | rejected | invalid-ack | not-framed | connect-failed |
 *            connect-timeout | reply-timeout | closed | cancelled | invalid-input
 *
 * options: host, port, message, encoding ('utf-8' | 'windows-1252'), connectTimeoutMs,
 *          replyTimeoutMs, signal (AbortSignal)
 */
async function sendMessage(options = {}) {
  const session = new MllpSession(options);
  try {
    return await session.send(options.message, { signal: options.signal });
  } finally {
    session.close();
  }
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
  frameMessage, toWireText, FrameReader, parseAck, validateTarget, MllpSession, sendMessage, testConnection, cleanRequest, visibleText, hexDump,
  MAX_FRAME_BYTES, DEFAULT_CONNECT_TIMEOUT_MS, DEFAULT_REPLY_TIMEOUT_MS,
};
