'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareFile, suggestFileName, normalizeLineEndings, encodeText, decodeBuffer, readMessages, readFile, writeFile } = require('../src/files');
const { generate } = require('../src/hl7/generator');
const { parseMessage, splitMessages, get } = require('../src/hl7/parser');
const { validate } = require('../src/hl7/validator');

const TEXT = ['MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01^ADT_A01|MSG0001|T|2.5.1', 'EVN|A01|20261023120000', 'PID|1||123^^^MAIN^MR||DOE^JOHN'];
const asString = (result) => result.data.toString('utf8');

test('the default is the HL7 standard: segments end with CR, also the last one', () => {
  const out = asString(prepareFile(TEXT.join('\n')));
  assert.strictEqual(out, TEXT.map((line) => `${line}\r`).join(''));
  assert.ok(!out.includes('\n'));
});

test('every kind of line ending in becomes the chosen one out', () => {
  const variants = [TEXT.join('\n'), TEXT.join('\r'), TEXT.join('\r\n'), TEXT.join('\n\n\n')];
  for (const text of variants) {
    assert.strictEqual(asString(prepareFile(text, { lineEnding: 'lf' })), `${TEXT.join('\n')}\n`.replace(/\n\n+/g, '\n'));
    assert.strictEqual(asString(prepareFile(text, { lineEnding: 'crlf' })).split('\r\n').length, 4);
  }
});

test('blank lines are dropped; spaces inside lines are kept', () => {
  const text = `${TEXT[0]}\n\n  \nPID|1||  123  ||DOE \n\n   \n`;
  assert.strictEqual(normalizeLineEndings(text, 'lf'), `${TEXT[0]}\nPID|1||  123  ||DOE \n`);
});

test('MLLP framing: start byte, message, end bytes', () => {
  const out = asString(prepareFile(TEXT.join('\n'), { mllp: true }));
  assert.ok(out.startsWith('\x0bMSH|'));
  assert.ok(out.endsWith('\r\x1c\r'));
  assert.strictEqual(out.split('\x0b').length, 2);
  // framing characters already in the text are not doubled
  const again = asString(prepareFile(`\x0b${TEXT.join('\r')}\r\x1c\r`, { mllp: true }));
  assert.strictEqual(again, out);
  assert.strictEqual(asString(prepareFile(`\x0b${TEXT.join('\r')}\r\x1c\r`)), asString(prepareFile(TEXT.join('\n'))));
});

test('a saved file can be read back: both plain and framed', () => {
  const generated = generate({ type: 'ADT^A01', seed: 5, now: new Date(2026, 9, 23, 12) }).text;
  for (const options of [{}, { mllp: true }, { lineEnding: 'crlf' }, { lineEnding: 'lf', mllp: true }]) {
    const saved = asString(prepareFile(generated, options));
    assert.deepStrictEqual(validate(saved).issues, []);
    assert.strictEqual(parseMessage(saved).segments.length, parseMessage(generated).segments.length);
    assert.strictEqual(get(parseMessage(saved), 'MSH-10'), get(parseMessage(generated), 'MSH-10'));
  }
});

test('UTF-8 keeps every character; Windows-1252 keeps its own and refuses the rest', () => {
  assert.deepStrictEqual([...encodeText('Müller €', 'utf-8')], [...Buffer.from('Müller €', 'utf8')]);
  assert.deepStrictEqual([...encodeText('Müller €“”', 'windows-1252')], [0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x20, 0x80, 0x93, 0x94]);
  assert.throws(() => encodeText('Иван', 'windows-1252'), /cannot be saved in Windows-1252/);
  assert.throws(() => prepareFile(`${TEXT.join('\n')}\nNTE|1||Ж`, { encoding: 'windows-1252' }), /Choose UTF-8/);
});

test('a note appears when MSH-18 says UTF-8 but the file is Windows-1252', () => {
  const generated = generate({ type: 'ADT^A01', seed: 5, now: new Date(2026, 9, 23, 12) }).text;
  assert.match(prepareFile(generated, { encoding: 'windows-1252' }).warning, /MSH-18/);
  assert.strictEqual(prepareFile(generated, { encoding: 'utf-8' }).warning, '');
  assert.strictEqual(prepareFile(TEXT.join('\n'), { encoding: 'windows-1252' }).warning, '');
});

test('nothing to save and bad options are explained', () => {
  assert.throws(() => prepareFile(''), /nothing to save/);
  assert.throws(() => prepareFile('  \n \r\n'), /nothing to save/);
  assert.throws(() => prepareFile('\x0b\x1c\r'), /nothing to save/);
  assert.throws(() => prepareFile(undefined), /must be text/);
  assert.throws(() => prepareFile(TEXT[0], { lineEnding: 'tab' }), /Unknown line ending/);
  assert.throws(() => prepareFile(TEXT[0], { encoding: 'utf-16' }), /Unknown encoding/);
});

test('the suggested file name comes from the message type and control ID and is safe', () => {
  assert.strictEqual(suggestFileName(TEXT.join('\n')), 'ADT_A01_MSG0001.hl7');
  assert.strictEqual(suggestFileName(TEXT[0].replace('MSG0001', '../../evil name*?')), 'ADT_A01_.._.._evil_name__.hl7');
  assert.strictEqual(suggestFileName('PID|1'), 'message.hl7');
  assert.strictEqual(suggestFileName(''), 'message.hl7');
  assert.strictEqual(suggestFileName(undefined), 'message.hl7');
  assert.ok(!/[\\/]/.test(suggestFileName(TEXT[0].replace('MSG0001', 'a/b\\c'))));
  assert.ok(suggestFileName(TEXT[0].replace('MSG0001', 'x'.repeat(500))).length <= 85);
});

test('the file is written byte for byte', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hl7-save-'));
  try {
    const target = path.join(folder, 'out.hl7');
    const { data } = prepareFile(TEXT.join('\n'), { mllp: true });
    await writeFile(target, data);
    assert.deepStrictEqual(fs.readFileSync(target), data);
    await assert.rejects(writeFile(path.join(folder, 'missing', 'out.hl7'), data), /ENOENT/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});

/* ---- reading ---- */

const NOW = new Date(2026, 9, 23, 12, 0, 0);
const sample = (type, seed) => generate({ type, seed, now: NOW }).text;
const bytes = (text, encoding = 'utf8') => Buffer.from(text, encoding);

test('splitMessages: one message per MSH, MLLP frames and batch envelopes are left out', () => {
  const a = sample('ADT^A01', 1);
  const b = sample('ORU^R01', 2);
  assert.deepStrictEqual(splitMessages(`${a}\n${b}`), [a, b]);
  assert.deepStrictEqual(splitMessages(`\x0b${a.replaceAll('\n', '\r')}\r\x1c\r\x0b${b.replaceAll('\n', '\r')}\r\x1c\r`), [a, b]);
  assert.deepStrictEqual(splitMessages(`FHS|^~\\&|X\rBHS|^~\\&|X\r${a.replaceAll('\n', '\r')}\r${b.replaceAll('\n', '\r')}\rBTS|2\rFTS|1\r`), [a, b]);
  assert.deepStrictEqual(splitMessages(''), []);
  assert.deepStrictEqual(splitMessages(undefined), []);
  assert.deepStrictEqual(splitMessages('\n\n  \n'), []);
  // lines before the first MSH stay together as one piece
  assert.deepStrictEqual(splitMessages('PID|1||5\nPV1|1|I'), ['PID|1||5\nPV1|1|I']);
  assert.deepStrictEqual(splitMessages(`PID|1\n${a}`), ['PID|1', a]);
});

test('every way of saving can be opened again: plain or wrapped, any line ending, one message', () => {
  const text = sample('ADT^A60', 3);
  for (const lineEnding of ['cr', 'lf', 'crlf']) {
    for (const mllp of [false, true]) {
      for (const encoding of ['utf-8', 'windows-1252']) {
        const read = readMessages(prepareFile(text, { lineEnding, mllp, encoding }).data);
        assert.strictEqual(read.messages.length, 1, `${lineEnding} ${mllp} ${encoding}`);
        assert.strictEqual(read.messages[0].text, text);
        // a file with only ASCII characters reads the same in both encodings, so it is reported as UTF-8
        assert.deepStrictEqual(read.format, { lineEnding, mllp, encoding: 'utf-8' });
      }
    }
  }
});

test('a file with several messages: plain, wrapped one after another, and as a batch', () => {
  const texts = [sample('ADT^A01', 1), sample('ORM^O01', 2), sample('ORU^R01', 3)];
  const plain = texts.map((t) => prepareFile(t).data.toString()).join('');
  const wrapped = texts.map((t) => prepareFile(t, { mllp: true }).data.toString()).join('');
  const batch = `FHS|^~\\&|HIS\rBHS|^~\\&|HIS\r${plain}BTS|3\rFTS|1\r`;
  for (const [text, isBatch] of [[plain, false], [wrapped, false], [batch, true]]) {
    const read = readMessages(bytes(text));
    assert.deepStrictEqual(read.messages.map((m) => m.text), texts);
    assert.strictEqual(read.batch, isBatch);
    assert.deepStrictEqual(read.messages.map((m) => m.type), ['ADT^A01', 'ORM^O01', 'ORU^R01']);
    for (const m of read.messages) {
      assert.match(m.patient, /^[A-Za-z]+, [A-Za-z]+$/);
      assert.match(m.time, /^\d{14}$/);
      assert.match(m.controlId, /^MSG/);
    }
  }
  assert.strictEqual(readMessages(bytes(wrapped)).format.mllp, true);
  assert.strictEqual(readMessages(bytes(plain)).format.mllp, false);
});

test('the same messages come out of a wrapped and an unwrapped file', () => {
  const text = sample('ADT^A01', 9);
  const plain = readMessages(prepareFile(text).data);
  const wrapped = readMessages(prepareFile(text, { mllp: true }).data);
  assert.deepStrictEqual(wrapped.messages, plain.messages);
});

test('encodings: UTF-8 with and without a mark, UTF-16 both ways, and Windows-1252 as the fallback', () => {
  const text = 'MSH|^~\\&|A|B|C|D|20261023120000||ADT^A01|M1|T|2.5.1\rPID|1||5||Müller^Jürgen€';
  const expected = text.replaceAll('\r', '\n');
  assert.strictEqual(readMessages(bytes(text)).messages[0].text, expected);
  assert.strictEqual(readMessages(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes(text)])).messages[0].text, expected);
  const le = Buffer.concat([Buffer.from([0xff, 0xfe]), bytes(text, 'utf16le')]);
  const be = Buffer.concat([Buffer.from([0xfe, 0xff]), Buffer.from(bytes(text, 'utf16le')).swap16()]);
  for (const buffer of [le, be]) {
    const read = readMessages(buffer);
    assert.strictEqual(read.messages[0].text, expected);
    assert.strictEqual(read.format.encoding, 'utf-8');
    assert.match(read.notes[0], /UTF-16/);
  }
  const old = readMessages(encodeText(text, 'windows-1252'));
  assert.strictEqual(old.messages[0].text, expected);
  assert.strictEqual(old.format.encoding, 'windows-1252');
  assert.match(old.notes[0], /Windows-1252/);
  assert.deepStrictEqual(readMessages(bytes(text)).notes, []);
  assert.strictEqual(decodeBuffer(Buffer.from([0x4d, 0x81, 0x8d])).text, 'M\u0081\u008d');
});

test('opening a file that is empty, binary or the wrong kind of input is explained', () => {
  assert.throws(() => readMessages(Buffer.alloc(0)), /empty/);
  assert.throws(() => readMessages(bytes('  \r\n \n')), /empty/);
  assert.throws(() => readMessages(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])), /does not look like a text file/);
  assert.throws(() => readMessages('text'), /must be bytes/);
  assert.throws(() => readMessages(Buffer.alloc(50 * 1024 * 1024 + 1, 65)), /too large/);
});

test('a file that is not HL7 still opens as text, so the validator can say what is wrong', () => {
  const read = readMessages(bytes('hello world\nsecond line'));
  assert.strictEqual(read.messages.length, 1);
  assert.strictEqual(read.messages[0].text, 'hello world\nsecond line');
  assert.strictEqual(read.messages[0].type, '');
  assert.strictEqual(read.format.lineEnding, 'lf');
  assert.strictEqual(readMessages(bytes('single line')).format.lineEnding, null);
});

test('files are read from disk', async () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'hl7-open-'));
  try {
    const text = sample('ORU^R01', 4);
    const target = path.join(folder, 'in.hl7');
    await writeFile(target, prepareFile(text, { mllp: true, lineEnding: 'crlf' }).data);
    const read = readMessages(await readFile(target));
    assert.strictEqual(read.messages[0].text, text);
    assert.deepStrictEqual(read.format, { lineEnding: 'crlf', mllp: true, encoding: 'utf-8' });
    await assert.rejects(readFile(path.join(folder, 'missing.hl7')), /ENOENT/);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
});
