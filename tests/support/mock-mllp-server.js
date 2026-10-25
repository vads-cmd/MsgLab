'use strict';

/**
 * A small MLLP server for tests, on the local machine, so no real HL7 server is needed.
 *
 *   const server = await startMockServer({ mode: 'accept' });
 *   ... send to 127.0.0.1:server.port ...
 *   server.received    // [{ text, bytes }] every message that arrived
 *   await server.close();
 *
 * modes (how it answers):
 *   accept       ACK AA (default)         error      ACK AE            reject     ACK AR
 *   enhanced     ACK CA                   silent     never answers     close      closes without answering
 *   unframed     answers without framing  garbage    framed, no MSA    split      ACK AA, one byte at a time
 *   mismatch     ACK AA for another message ID
 * delayMs waits before answering. text sets the MSA-3 text.
 */

const net = require('node:net');
const { FrameReader } = require('../../src/mllp');
const { parseMessage, get } = require('../../src/hl7/parser');
const { decodeBuffer } = require('../../src/files');

const ACK_CODE_FOR_MODE = { accept: 'AA', error: 'AE', reject: 'AR', enhanced: 'CA', split: 'AA', mismatch: 'AA' };

function buildAck(messageText, code, text = '', controlId = null) {
  const msg = parseMessage(messageText);
  const ackId = controlId ?? get(msg, 'MSH-10');
  const now = '20261026120000';
  const swap = (path) => get(msg, path);
  const version = get(msg, 'MSH-12') || '2.5.1';
  const msh = String.raw`MSH|^~\&|${swap('MSH-5')}|${swap('MSH-6')}|${swap('MSH-3')}|${swap('MSH-4')}|${now}||ACK^${get(msg, 'MSH-9.2')}|ACK${ackId}|P|${version}`;
  return `${msh}\rMSA|${code}|${ackId}|${text}\r`;
}

const frame = (text) => Buffer.concat([Buffer.from([0x0b]), Buffer.from(text, 'latin1'), Buffer.from([0x1c, 0x0d])]);

function replyFor(mode, messageText, text) {
  if (mode === 'unframed') return Buffer.from(buildAck(messageText, 'AA', text), 'latin1');
  if (mode === 'garbage') return frame('HELLO|THIS|IS|NOT|AN|ACK\r');
  if (mode === 'mismatch') return frame(buildAck(messageText, 'AA', text, 'OTHER-ID'));
  return frame(buildAck(messageText, ACK_CODE_FOR_MODE[mode] ?? 'AA', text));
}

/** One byte every 2 ms, so the client has to put a frame together from many pieces. */
function writeSlowly(socket, bytes, index = 0) {
  if (index >= bytes.length || socket.destroyed) return;
  socket.write(Buffer.from([bytes[index]]));
  setTimeout(() => writeSlowly(socket, bytes, index + 1), 2);
}

/** What the server does with one connection: read frames, answer each one the way the mode says. */
function handleConnection(socket, { mode, delayMs, text }, received) {
  const reader = new FrameReader();
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    for (const payload of reader.push(chunk)) {
      const messageText = decodeBuffer(payload).text;
      received.push({ text: messageText, bytes: Buffer.from(payload) });
      if (mode !== 'silent') setTimeout(() => answer(socket, mode, messageText, text), delayMs);
    }
  });
}

function answer(socket, mode, messageText, text) {
  if (mode === 'close') socket.end();
  else if (mode === 'split') writeSlowly(socket, replyFor(mode, messageText, text));
  else socket.write(replyFor(mode, messageText, text));
}

function startMockServer({ mode = 'accept', delayMs = 0, text = '' } = {}) {
  const received = [];
  const sockets = new Set();
  let connections = 0;

  const server = net.createServer((socket) => {
    connections += 1;
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    handleConnection(socket, { mode, delayMs, text }, received);
  });

  const closeAll = () => new Promise((done) => {
    for (const socket of sockets) socket.destroy();
    server.close(() => done());
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        host: '127.0.0.1',
        port: server.address().port,
        received,
        get connections() { return connections; },
        close: closeAll,
      });
    });
  });
}

module.exports = { startMockServer, buildAck };
