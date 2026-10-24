'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { generateBulk, BULK_TYPES, MAX_COUNT } = require('../src/hl7/bulk');
const { parseMessage, get } = require('../src/hl7/parser');
const { validate } = require('../src/hl7/validator');

const NOW = new Date(2026, 9, 23, 12, 0, 0);
const bulk = (extra = {}) => generateBulk({ count: 12, types: ['ADT^A01'], seed: 'b', now: NOW, ...extra });
const parsed = (result) => result.messages.map((m) => parseMessage(m.text));

test('the right number of messages comes out, each one valid and with its own control ID', () => {
  const result = bulk({ count: 60, types: BULK_TYPES.filter((t) => t !== 'ADT^A18') });
  assert.strictEqual(result.count, 60);
  assert.strictEqual(result.messages.length, 60);
  assert.strictEqual(new Set(result.messages.map((m) => m.controlId)).size, 60);
  for (const [i, message] of result.messages.entries()) {
    const v = validate(message.text);
    assert.deepStrictEqual(v.issues, [], `message ${i + 1} ${message.type}`);
    assert.strictEqual(get(parseMessage(message.text), 'MSH-10'), message.controlId);
    assert.strictEqual(v.messageType, message.type);
  }
});

test('control IDs stay unique when all messages have the same time', () => {
  const result = bulk({ count: 300, minutesBetween: 0 });
  assert.strictEqual(new Set(result.messages.map((m) => m.controlId)).size, 300);
});

test('the same seed gives the same messages, another seed gives others', () => {
  assert.deepStrictEqual(bulk(), bulk());
  assert.notDeepStrictEqual(bulk().messages.map((m) => m.text), bulk({ seed: 'other' }).messages.map((m) => m.text));
});

test('messages are spaced in time and the last one is at the given time', () => {
  const result = bulk({ count: 4, minutesBetween: 10 });
  assert.deepStrictEqual(result.messages.map((m) => m.time), ['20261023113000', '20261023114000', '20261023115000', '20261023120000']);
  assert.strictEqual(get(parseMessage(result.messages[3].text), 'MSH-7'), '20261023120000');
  const same = bulk({ count: 3, minutesBetween: 0 });
  assert.strictEqual(new Set(same.messages.map((m) => m.time)).size, 1);
});

test('independent mode: a new patient for every message, types taken in turn', () => {
  const result = bulk({ count: 6, types: ['ADT^A01', 'ADT^A03'] });
  assert.deepStrictEqual(result.messages.map((m) => m.type), ['ADT^A01', 'ADT^A03', 'ADT^A01', 'ADT^A03', 'ADT^A01', 'ADT^A03']);
  assert.strictEqual(result.patients, 6);
  assert.strictEqual(new Set(parsed(result).map((m) => get(m, 'PID-3.1'))).size, 6);
});

test('journey mode: each patient goes through the chosen events in order', () => {
  const result = bulk({ count: 9, mode: 'journey', types: ['ADT^A03', 'ORU^R01', 'ADT^A01'] });
  assert.strictEqual(result.patients, 3);
  assert.deepStrictEqual(result.messages.map((m) => m.type).slice(0, 3), ['ADT^A01', 'ORU^R01', 'ADT^A03']);
  const messages = parsed(result);
  for (let patient = 0; patient < 3; patient++) {
    const group = messages.slice(patient * 3, patient * 3 + 3);
    for (const path of ['PID-3', 'PID-5', 'PID-7', 'PV1-3', 'PV1-7', 'PV1-19', 'PV1-44']) {
      assert.strictEqual(new Set(group.map((m) => get(m, path))).size, 1, `patient ${patient} ${path}`);
    }
    assert.strictEqual(get(group[0], 'PV1-44'), get(group[0], 'MSH-7'));
    assert.ok(get(group[2], 'PV1-45') > get(group[2], 'PV1-44'));
  }
  assert.notStrictEqual(get(messages[0], 'PID-3'), get(messages[3], 'PID-3'));
});

test('journey mode with a count that does not fill the last stay', () => {
  const result = bulk({ count: 5, mode: 'journey', types: ['ADT^A01', 'ADT^A03'] });
  assert.strictEqual(result.patients, 3);
  assert.strictEqual(result.messages[4].type, 'ADT^A01');
});

test('the patient name is shown for every message', () => {
  for (const message of bulk().messages) assert.match(message.patient, /^[A-Za-z]+, [A-Za-z]+$/);
});

test('settings from the form are used', () => {
  const m = parseMessage(bulk({ count: 1, version: '2.3', sendingApp: 'LAB', receivingFacility: 'CLINIC', processingId: 'P' }).messages[0].text);
  assert.strictEqual(get(m, 'MSH-12'), '2.3');
  assert.strictEqual(get(m, 'MSH-3'), 'LAB');
  assert.strictEqual(get(m, 'MSH-6'), 'CLINIC');
  assert.strictEqual(get(m, 'MSH-11'), 'P');
});

test('bad options are explained', () => {
  assert.throws(() => bulk({ count: 0 }), /from 1 to/);
  assert.throws(() => bulk({ count: MAX_COUNT + 1 }), /from 1 to/);
  assert.throws(() => bulk({ count: 2.5 }), /whole number/);
  assert.throws(() => bulk({ count: 'abc' }), /whole number/);
  assert.throws(() => bulk({ types: [] }), /at least one/);
  assert.throws(() => bulk({ types: undefined }), /at least one/);
  assert.throws(() => bulk({ types: ['ACK'] }), /Unsupported message type/);
  assert.throws(() => bulk({ types: ['ADT^A99'] }), /Unsupported message type/);
  assert.throws(() => bulk({ mode: 'weird' }), /Unknown mode/);
  assert.throws(() => bulk({ minutesBetween: -1 }), /Minutes between/);
  assert.throws(() => bulk({ minutesBetween: 5000 }), /Minutes between/);
  assert.throws(() => bulk({ version: '9.9' }), /Unsupported HL7 version/);
});

test('without a seed a random one is used and reported', () => {
  const result = generateBulk({ count: 2, types: ['ADT^A01'], now: NOW });
  assert.match(result.seed, /^\d+$/);
  assert.deepStrictEqual(generateBulk({ count: 2, types: ['ADT^A01'], now: NOW, seed: result.seed }).messages, result.messages);
});

test('the largest bulk comes out quickly', () => {
  const started = Date.now();
  const result = bulk({ count: MAX_COUNT, types: BULK_TYPES });
  assert.strictEqual(result.messages.length, MAX_COUNT);
  assert.ok(Date.now() - started < 10000);
});
