'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { generate, VERSIONS, MANUAL_FIELDS } = require('../src/hl7/generator');
const { validate } = require('../src/hl7/validator');
const { explain } = require('../src/hl7/explainer');
const { parseMessage, get } = require('../src/hl7/parser');

const NOW = new Date(2026, 9, 23, 12, 0, 0);

test('every supported version gives a valid ADT^A01 with no warnings', () => {
  for (const version of VERSIONS) {
    const r = generate({ version, seed: 7, now: NOW });
    const v = validate(r.text);
    assert.deepStrictEqual(v.issues, [], `version ${version}`);
    assert.strictEqual(v.messageType, 'ADT^A01');
    assert.strictEqual(get(parseMessage(r.text), 'MSH-12'), version);
  }
});

test('the generated message can be explained', () => {
  const e = explain(generate({ seed: 7, now: NOW }).text);
  assert.ok(e.facts.some((f) => f.label === 'Patient' && f.value.includes(',')));
  assert.match(e.narrative, /was admitted/);
});

test('the same seed and time give the same message; another seed gives another', () => {
  const a = generate({ seed: 42, now: NOW });
  const b = generate({ seed: 42, now: NOW });
  const c = generate({ seed: 43, now: NOW });
  assert.strictEqual(a.text, b.text);
  assert.notStrictEqual(a.text, c.text);
});

test('text seeds work and are repeatable', () => {
  const a = generate({ seed: 'my test case', now: NOW });
  assert.strictEqual(a.seed, 'my test case');
  assert.strictEqual(generate({ seed: 'my test case', now: NOW }).text, a.text);
});

test('without a seed a random one is chosen and reported, so the message can be repeated', () => {
  const a = generate({ now: NOW });
  assert.match(a.seed, /^\d+$/);
  assert.strictEqual(generate({ seed: a.seed, now: NOW }).text, a.text);
  assert.notStrictEqual(generate({ now: NOW }).text, generate({ now: NOW }).text);
});

test('sender, receiver and processing ID are used', () => {
  const msg = parseMessage(generate({
    sendingApp: 'LAB', sendingFacility: 'NORTH', receivingApp: 'RIS', receivingFacility: 'SOUTH', processingId: 'P', seed: 1, now: NOW,
  }).text);
  assert.deepStrictEqual(
    ['MSH-3', 'MSH-4', 'MSH-5', 'MSH-6', 'MSH-11'].map((p) => get(msg, p)),
    ['LAB', 'NORTH', 'RIS', 'SOUTH', 'P'],
  );
});

test('separator characters in names are escaped and cannot break the message', () => {
  const r = generate({ sendingApp: 'A|B^C&D~E\\F', sendingFacility: 'X\nY', seed: 1, now: NOW });
  assert.strictEqual(validate(r.text).valid, true);
  const msg = parseMessage(r.text);
  assert.strictEqual(get(msg, 'MSH-3', { unescaped: true }), 'A|B^C&D~E\\F');
  assert.strictEqual(get(msg, 'MSH-4', { unescaped: true }), 'X Y');
  assert.strictEqual(msg.segments.length, 4);
});

test('empty names fall back to defaults', () => {
  const msg = parseMessage(generate({ sendingApp: '  ', receivingApp: '', seed: 1, now: NOW }).text);
  assert.strictEqual(get(msg, 'MSH-3'), 'HIS');
  assert.strictEqual(get(msg, 'MSH-5'), 'EHR');
});

test('older versions use the older header layout', () => {
  const old = parseMessage(generate({ version: '2.3', seed: 1, now: NOW }).text);
  assert.strictEqual(get(old, 'MSH-9.3'), '');
  assert.strictEqual(get(old, 'MSH-15'), '');
  const current = parseMessage(generate({ version: '2.5.1', seed: 1, now: NOW }).text);
  assert.strictEqual(get(current, 'MSH-9.3'), 'ADT_A01');
  assert.strictEqual(get(current, 'MSH-15'), 'AL');
  assert.strictEqual(get(current, 'MSH-18'), 'UNICODE UTF-8');
});

test('the patient is an adult with a plausible birth date', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const msg = parseMessage(generate({ seed, now: NOW }).text);
    const dob = get(msg, 'PID-7');
    assert.match(dob, /^\d{8}$/);
    const age = (NOW.getTime() - Date.UTC(+dob.slice(0, 4), +dob.slice(4, 6) - 1, +dob.slice(6, 8))) / (365.25 * 86400000);
    assert.ok(age >= 17.9 && age <= 90.1, `age ${age} for seed ${seed}`);
    assert.ok(['F', 'M'].includes(get(msg, 'PID-8')));
  }
});

test('the line ending can be chosen', () => {
  assert.strictEqual(generate({ seed: 1, now: NOW, eol: '\r' }).text.split('\r').length, 4);
});

test('unsupported options are rejected', () => {
  assert.throws(() => generate({ type: 'ORU^R01' }), /Unsupported message type/);
  assert.throws(() => generate({ version: '9.9' }), /Unsupported HL7 version/);
  assert.throws(() => generate({ processingId: 'X' }), /Unsupported processing ID/);
});

/* ---- ADT events ---- */

const EVENTS = ['A01', 'A02', 'A03', 'A08'];

test('every event and every version gives a valid message with no warnings', () => {
  for (const event of EVENTS) {
    for (const version of VERSIONS) {
      const r = generate({ type: `ADT^${event}`, version, seed: 11, now: NOW });
      const v = validate(r.text);
      assert.deepStrictEqual(v.issues, [], `${event} v${version}`);
      assert.strictEqual(v.messageType, `ADT^${event}`);
      assert.strictEqual(get(parseMessage(r.text), 'EVN-1'), event);
    }
  }
});

test('the same seed gives the same patient, visit and doctor in every event', () => {
  const messages = EVENTS.map((e) => parseMessage(generate({ type: `ADT^${e}`, seed: 'follow-up', now: NOW }).text));
  for (const path of ['PID-3', 'PID-5', 'PID-7', 'PID-8', 'PID-11', 'PV1-7', 'PV1-19']) {
    const values = messages.map((m) => get(m, path));
    assert.ok(values[0] !== '', path);
    assert.strictEqual(new Set(values).size, 1, path);
  }
});

test('A01 and A08 have the same visit fields; A08 uses the A01 structure', () => {
  const a08 = parseMessage(generate({ type: 'ADT^A08', seed: 3, now: NOW }).text);
  assert.strictEqual(get(a08, 'MSH-9.3'), 'ADT_A01');
  assert.strictEqual(get(a08, 'PV1-45'), '');
});

test('A02 shows where the patient came from, and the stay started earlier', () => {
  const m = parseMessage(generate({ type: 'ADT^A02', seed: 3, now: NOW }).text);
  assert.strictEqual(get(m, 'MSH-9.3'), 'ADT_A02');
  assert.ok(get(m, 'PV1-3') !== '' && get(m, 'PV1-6') !== '');
  assert.ok(get(m, 'PV1-44') < get(m, 'MSH-7'));
  assert.strictEqual(get(parseMessage(generate({ type: 'ADT^A01', seed: 3, now: NOW }).text), 'PV1-6'), '');
});

test('A03 has a discharge time that is after the admit time', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const m = parseMessage(generate({ type: 'ADT^A03', seed, now: NOW }).text);
    assert.strictEqual(get(m, 'MSH-9.3'), 'ADT_A03');
    assert.ok(get(m, 'PV1-45') > get(m, 'PV1-44'), `seed ${seed}`);
    assert.strictEqual(get(m, 'PV1-45'), get(m, 'EVN-2'));
  }
});

test('the explanation describes each event', () => {
  const sentence = (event) => explain(generate({ type: `ADT^${event}`, seed: 9, now: NOW }).text).narrative;
  assert.match(sentence('A01'), /was admitted/);
  assert.match(sentence('A02'), /was transferred/);
  assert.match(sentence('A03'), /was discharged/);
  assert.match(sentence('A08'), /had their information updated/);
});

/* ---- manual values ---- */

const base = (extra = {}) => generate({ seed: 21, now: NOW, ...extra });
const parse = (r) => parseMessage(r.text);

test('a typed value is used and everything else stays as it was', () => {
  const plain = parse(base());
  const typed = parse(base({ fields: { familyName: 'Doe', mrn: 'TEST-001' } }));
  assert.strictEqual(get(typed, 'PID-5.1'), 'Doe');
  assert.strictEqual(get(typed, 'PID-3.1'), 'TEST-001');
  assert.strictEqual(get(typed, 'PID-5.2'), get(plain, 'PID-5.2'));
  for (const path of ['PID-7', 'PID-8', 'PID-11', 'PID-13', 'PV1-3', 'PV1-7', 'PV1-19', 'PV1-44']) {
    assert.strictEqual(get(typed, path), get(plain, path), path);
  }
});

test('a field set to null is left empty, and the validator then reports what is missing', () => {
  const r = base({ fields: { phone: null, birthDate: null, mrn: null } });
  const m = parse(r);
  assert.strictEqual(get(m, 'PID-13'), '');
  assert.strictEqual(get(m, 'PID-7'), '');
  assert.strictEqual(get(m, 'PID-3'), '');
  const v = validate(r.text);
  assert.deepStrictEqual(v.issues.map((i) => `${i.rule}:${i.path}`), ['REQUIRED_FIELD:PID-3']);
});

test('a composite field is empty only when all of its parts are empty', () => {
  const name = parse(base({ fields: { familyName: null, givenName: null, middleInitial: null } }));
  assert.strictEqual(get(name, 'PID-5'), '');
  const partly = parse(base({ fields: { familyName: null } }));
  assert.strictEqual(get(partly, 'PID-5.1'), '');
  assert.ok(get(partly, 'PID-5.2') !== '');
  const address = parse(base({ fields: { street: null, city: null, state: null, zip: null } }));
  assert.strictEqual(get(address, 'PID-11'), '');
  const place = parse(base({ fields: { unit: null, room: null, bed: null } }));
  assert.strictEqual(get(place, 'PV1-3'), '');
  const doctor = parse(base({ fields: { doctorId: null, doctorFamily: null, doctorGiven: null } }));
  assert.strictEqual(get(doctor, 'PV1-7'), '');
});

test('an empty text means random, the same as leaving it out', () => {
  assert.strictEqual(base({ fields: { familyName: '', city: '   ' } }).text, base().text);
});

test('the patient class can be typed or emptied', () => {
  assert.strictEqual(get(parse(base()), 'PV1-2'), 'I');
  assert.strictEqual(get(parse(base({ fields: { patientClass: 'E' } })), 'PV1-2'), 'E');
  const empty = base({ fields: { patientClass: null } });
  assert.strictEqual(get(parse(empty), 'PV1-2'), '');
  assert.ok(validate(empty.text).issues.some((i) => i.rule === 'REQUIRED_FIELD' && i.path === 'PV1-2'));
});

test('typed values are escaped and cannot break the message', () => {
  const r = base({ fields: { familyName: "O'Brien|X^Y&Z~W\\V", street: 'Line1\nLine2' } });
  const m = parse(r);
  assert.strictEqual(m.segments.length, 4);
  assert.strictEqual(get(m, 'PID-5.1', { unescaped: true }), "O'Brien|X^Y&Z~W\\V");
  assert.strictEqual(get(m, 'PID-11.1', { unescaped: true }), 'Line1 Line2');
  assert.strictEqual(validate(r.text).valid, true);
});

test('values that are wrong on purpose are passed on as typed, so errors can be tested', () => {
  const r = base({ fields: { birthDate: '19801345', sex: 'Q' } });
  assert.strictEqual(get(parse(r), 'PID-7'), '19801345');
  const v = validate(r.text);
  assert.ok(v.issues.some((i) => i.rule === 'DATA_TYPE' && i.path === 'PID-7'));
});

test('event-specific values: prior location for A02, times for A02 and A03', () => {
  const a02 = parse(base({ type: 'ADT^A02', fields: { priorUnit: 'ER', priorRoom: '12', priorBed: 'B', admitTime: '20261020080000' } }));
  assert.strictEqual(get(a02, 'PV1-6'), 'ER^12^B^MAINHOSP');
  assert.strictEqual(get(a02, 'PV1-44'), '20261020080000');
  const noPrior = parse(base({ type: 'ADT^A02', fields: { priorUnit: null, priorRoom: null, priorBed: null } }));
  assert.strictEqual(get(noPrior, 'PV1-6'), '');

  const a03 = parse(base({ type: 'ADT^A03', fields: { dischargeTime: '20261022140000' } }));
  assert.strictEqual(get(a03, 'PV1-45'), '20261022140000');
  assert.strictEqual(get(parse(base({ type: 'ADT^A03', fields: { dischargeTime: null } })), 'PV1-45'), '');
});

test('event-specific values are ignored for other events', () => {
  const m = parse(base({ type: 'ADT^A01', fields: { priorUnit: 'ER', dischargeTime: '20261022140000' } }));
  assert.strictEqual(get(m, 'PV1-6'), '');
  assert.strictEqual(get(m, 'PV1-45'), '');
});

test('the result lists which fields were set by hand', () => {
  assert.deepStrictEqual(base().manual, []);
  assert.deepStrictEqual(base({ fields: { familyName: 'Doe', phone: null } }).manual.sort(), ['familyName', 'phone']);
});

test('unknown or wrongly typed manual fields are rejected', () => {
  assert.throws(() => base({ fields: { shoeSize: '42' } }), /Unknown manual field: shoeSize/);
  assert.throws(() => base({ fields: { familyName: 5 } }), /must be text or null/);
  assert.throws(() => base({ fields: ['x'] }), /must be an object/);
  assert.throws(() => base({ fields: { toString: 'x' } }), /Unknown manual field/);
});

test('the admit time can be typed or emptied in every event, including A01', () => {
  for (const event of EVENTS) {
    const type = `ADT^${event}`;
    assert.strictEqual(get(parse(base({ type, fields: { admitTime: '20261001090000' } })), 'PV1-44'), '20261001090000', type);
    assert.strictEqual(get(parse(base({ type, fields: { admitTime: null } })), 'PV1-44'), '', type);
  }
});

/* ---- the remaining fixed values ---- */

test('marital status: a known code gets its name, other text is sent as typed, null is empty', () => {
  assert.strictEqual(get(parse(base({ fields: { maritalStatus: 'M' } })), 'PID-16'), 'M^Married^HL70002');
  assert.strictEqual(get(parse(base({ fields: { maritalStatus: 'Z' } })), 'PID-16'), 'Z');
  assert.strictEqual(get(parse(base({ fields: { maritalStatus: null } })), 'PID-16'), '');
  assert.match(get(parse(base()), 'PID-16'), /^[SMDW]\^\w+\^HL70002$/);
});

test('admission type and hospital service can be typed or emptied', () => {
  assert.strictEqual(get(parse(base()), 'PV1-4'), 'R');
  assert.strictEqual(get(parse(base({ fields: { admissionType: 'E' } })), 'PV1-4'), 'E');
  assert.strictEqual(get(parse(base({ fields: { admissionType: null } })), 'PV1-4'), '');
  assert.ok(get(parse(base()), 'PV1-10') !== '');
  assert.strictEqual(get(parse(base({ fields: { hospitalService: 'SUR' } })), 'PV1-10'), 'SUR');
  assert.strictEqual(get(parse(base({ fields: { hospitalService: null } })), 'PV1-10'), '');
});

test('the discharge disposition belongs to A03 only', () => {
  assert.strictEqual(get(parse(base({ type: 'ADT^A03' })), 'PV1-36'), '01');
  assert.strictEqual(get(parse(base({ type: 'ADT^A03', fields: { dischargeDisposition: '07' } })), 'PV1-36'), '07');
  assert.strictEqual(get(parse(base({ type: 'ADT^A03', fields: { dischargeDisposition: null } })), 'PV1-36'), '');
  assert.strictEqual(get(parse(base({ type: 'ADT^A01', fields: { dischargeDisposition: '07' } })), 'PV1-36'), '');
});

test('with every manual field set to empty, only the structure is left', () => {
  const allNull = Object.fromEntries(MANUAL_FIELDS.map((key) => [key, null]));
  for (const event of EVENTS) {
    const m = parse(base({ type: `ADT^${event}`, fields: allNull }));
    for (const name of ['PID', 'PV1']) {
      const seg = m.segments.find((s) => s.name === name);
      const filled = seg.fields.map((f, i) => (i > 1 && f && f.raw !== '' ? `${name}-${i}=${f.raw}` : null)).filter(Boolean);
      assert.deepStrictEqual(filled, [], `${event} ${name}`);
    }
    assert.strictEqual(m.segments.length, 4);
    assert.ok(get(m, 'MSH-10') !== '' && get(m, 'EVN-2') !== '');
  }
});
