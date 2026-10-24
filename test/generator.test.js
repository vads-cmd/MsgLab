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
  assert.throws(() => generate({ type: 'ORU^R30' }), /Unsupported message type/);
  assert.throws(() => generate({ version: '9.9' }), /Unsupported HL7 version/);
  assert.throws(() => generate({ processingId: 'X' }), /Unsupported processing ID/);
});

/* ---- ADT events ---- */

const EVENTS = ['A01', 'A02', 'A03', 'A08', 'A18', 'A40', 'A60'];

// A18 was withdrawn in HL7 2.4; A60 only exists from 2.4. The validator says so, and nothing else.
const VERSION_WARNINGS = (event, version) => {
  const later = VERSIONS.indexOf(version) >= VERSIONS.indexOf('2.4');
  if (event === 'A18' && later) return ['EVENT_RETIRED'];
  if (event === 'A60' && !later) return ['EVENT_NOT_IN_VERSION'];
  return [];
};

test('every event and every version gives a valid message with no unexpected warnings', () => {
  for (const event of EVENTS) {
    for (const version of VERSIONS) {
      const r = generate({ type: `ADT^${event}`, version, seed: 11, now: NOW });
      const v = validate(r.text);
      assert.deepStrictEqual(v.issues.map((i) => i.rule), VERSION_WARNINGS(event, version), `${event} v${version}`);
      assert.strictEqual(v.valid, true);
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
  assert.match(sentence('A18'), /had another patient record merged into theirs/);
  assert.match(sentence('A40'), /had another patient identifier merged into theirs/);
  assert.match(sentence('A60'), /had their allergy information updated/);
});

test('A18 and A40 carry the merged-away patient in MRG, A60 carries the allergy in IAM', () => {
  for (const event of ['A18', 'A40']) {
    const m = parseMessage(generate({ type: `ADT^${event}`, seed: 4, now: NOW }).text);
    assert.strictEqual(get(m, 'MSH-9.3'), event === 'A40' ? 'ADT_A39' : 'ADT_A18');
    assert.ok(get(m, 'MRG-1.1').startsWith('MRN'));
    assert.notStrictEqual(get(m, 'MRG-1.1'), get(m, 'PID-3.1'));
    assert.ok(get(m, 'MRG-7.1') !== '' && get(m, 'MRG-7.2') !== '');
    assert.strictEqual(get(m, 'IAM-3'), '');
  }
  const a60 = parseMessage(generate({ type: 'ADT^A60', seed: 4, now: NOW }).text);
  assert.strictEqual(get(a60, 'MSH-9.3'), 'ADT_A60');
  assert.strictEqual(get(a60, 'MRG-1'), '');
  assert.ok(get(a60, 'IAM-3.2') !== '' && get(a60, 'IAM-4.2') !== '' && get(a60, 'IAM-2.2') !== '');
  assert.strictEqual(get(a60, 'IAM-6'), 'A');
});

test('manual values for merge and allergy fields', () => {
  const merge = parseMessage(generate({ type: 'ADT^A18', seed: 4, now: NOW, fields: { priorPatientId: 'OLD-1', priorFamilyName: 'Doe', priorGivenName: null } }).text);
  assert.strictEqual(get(merge, 'MRG-1.1'), 'OLD-1');
  assert.strictEqual(get(merge, 'MRG-7.1'), 'Doe');
  assert.strictEqual(get(merge, 'MRG-7.2'), '');
  const none = parseMessage(generate({ type: 'ADT^A40', seed: 4, now: NOW, fields: { priorPatientId: null, priorFamilyName: null, priorGivenName: null } }).text);
  assert.strictEqual(get(none, 'MRG-1'), '');
  assert.strictEqual(get(none, 'MRG-7'), '');
  const allergy = parseMessage(generate({ type: 'ADT^A60', seed: 4, now: NOW, fields: { allergen: 'PNUT', allergyType: 'FA', allergySeverity: 'SV' } }).text);
  assert.strictEqual(get(allergy, 'IAM-3'), 'PNUT^Peanuts^L');
  assert.strictEqual(get(allergy, 'IAM-2'), 'FA^Food allergy^HL70127');
  assert.strictEqual(get(allergy, 'IAM-4'), 'SV^Severe^HL70128');
  const text = parseMessage(generate({ type: 'ADT^A60', seed: 4, now: NOW, fields: { allergen: 'Kiwi', allergySeverity: null } }).text);
  assert.strictEqual(get(text, 'IAM-3'), 'Kiwi');
  assert.strictEqual(get(text, 'IAM-4'), '');
});

test('the patient stays the same when an older event is changed into a merge or allergy event', () => {
  const a01 = parseMessage(generate({ type: 'ADT^A01', seed: 'same', now: NOW }).text);
  for (const event of ['A18', 'A40', 'A60']) {
    const m = parseMessage(generate({ type: `ADT^${event}`, seed: 'same', now: NOW }).text);
    for (const path of ['PID-3', 'PID-5', 'PID-7', 'PV1-3', 'PV1-7']) assert.strictEqual(get(m, path), get(a01, path), path);
  }
});

/* ---- ORM^O01 orders ---- */

test('ORM^O01 is valid in every version and has the order segments', () => {
  for (const version of VERSIONS) {
    const r = generate({ type: 'ORM^O01', version, seed: 12, now: NOW });
    const v = validate(r.text);
    assert.deepStrictEqual(v.issues, [], `v${version}`);
    assert.strictEqual(v.messageType, 'ORM^O01');
    const m = parseMessage(r.text);
    assert.deepStrictEqual(m.segments.map((s) => s.name), ['MSH', 'PID', 'PV1', 'ORC', 'OBR']);
    assert.strictEqual(get(m, 'MSH-9.3'), version === '2.3' || version === '2.3.1' ? '' : 'ORM_O01');
    assert.strictEqual(get(m, 'ORC-1'), 'NW');
    assert.strictEqual(get(m, 'ORC-2'), get(m, 'OBR-2'));
    assert.strictEqual(get(m, 'ORC-12'), get(m, 'OBR-16'));
    assert.ok(get(m, 'OBR-4.1') !== '' && get(m, 'OBR-4.2') !== '');
  }
});

test('ORM^O01 has the same patient, visit and doctor as an ADT message with the same seed', () => {
  const orm = parseMessage(generate({ type: 'ORM^O01', seed: 'same', now: NOW }).text);
  const a01 = parseMessage(generate({ type: 'ADT^A01', seed: 'same', now: NOW }).text);
  for (const path of ['PID-3', 'PID-5', 'PID-7', 'PV1-3', 'PV1-7']) assert.strictEqual(get(orm, path), get(a01, path), path);
});

test('ORM^O01 manual order values', () => {
  const text = (fields) => generate({ type: 'ORM^O01', seed: 4, now: NOW, fields }).text;
  const m = parseMessage(text({ orderControl: 'CA', placerOrderNumber: 'P-1', fillerOrderNumber: 'F-1', serviceCode: '24323-8', orderReason: 'Rule out anemia', orderTime: '20260101080000' }));
  assert.strictEqual(get(m, 'ORC-1'), 'CA');
  assert.strictEqual(get(m, 'ORC-2.1'), 'P-1');
  assert.strictEqual(get(m, 'OBR-3.1'), 'F-1');
  assert.strictEqual(get(m, 'OBR-4'), '24323-8^Comprehensive metabolic panel^LN');
  assert.strictEqual(get(m, 'OBR-31'), 'Rule out anemia');
  assert.strictEqual(get(m, 'ORC-9'), '20260101080000');
  // a code that is not in the list has no name unless one is typed
  assert.strictEqual(get(parseMessage(text({ serviceCode: 'X1' })), 'OBR-4'), 'X1^^L');
  assert.strictEqual(get(parseMessage(text({ serviceCode: 'X1', serviceName: 'My test' })), 'OBR-4'), 'X1^My test^L');
  const none = parseMessage(text({ placerOrderNumber: null }));
  assert.strictEqual(get(none, 'ORC-2'), '');
  assert.strictEqual(get(none, 'OBR-2'), '');
});

test('the explanation of an order names the order and the tests', () => {
  const e = explain(generate({ type: 'ORM^O01', seed: 9, now: NOW }).text);
  assert.match(e.narrative, /Carries an order \(NW/);
  const labels = e.facts.map((x) => x.label);
  assert.ok(labels.includes('Order control') && labels.includes('Placer order number') && labels.includes('Order'));
});

/* ---- ORU^R01 results ---- */

const oruParsed = (extra = {}) => parseMessage(generate({ type: 'ORU^R01', seed: 6, now: NOW, ...extra }).text);
const observations = (m) => m.segments.filter((s) => s.name === 'OBX');

test('ORU^R01 is valid in every version and has the result segments', () => {
  for (const version of VERSIONS) {
    const r = generate({ type: 'ORU^R01', version, seed: 12, now: NOW });
    const v = validate(r.text);
    assert.deepStrictEqual(v.issues, [], `v${version}`);
    assert.strictEqual(v.messageType, 'ORU^R01');
    const names = parseMessage(r.text).segments.map((s) => s.name);
    assert.deepStrictEqual(names.slice(0, 5), ['MSH', 'PID', 'PV1', 'ORC', 'OBR']);
    assert.ok(names.length >= 6 && names.slice(5).every((n) => n === 'OBX'));
  }
});

test('every result has a unit, a range and a flag that matches the value', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const m = oruParsed({ seed });
    const obxs = observations(m);
    assert.strictEqual(get(m, 'OBR-25'), 'F');
    assert.strictEqual(get(m, 'OBR-4.1') !== '', true);
    obxs.forEach((_, i) => {
      const at = (path) => get(m, `OBX[${i + 1}]-${path}`);
      const [low, high] = at('7').split('-').map(Number);
      const value = Number(at('5'));
      const expected = value < low ? 'L' : (value > high ? 'H' : 'N');
      assert.strictEqual(at('8'), expected, `seed ${seed} OBX ${i + 1}`);
      assert.strictEqual(at('1'), String(i + 1));
      assert.ok(at('6') !== '' && at('3.1') !== '' && at('2') === 'NM');
    });
  }
});

test('some results are flagged and some are normal, over many seeds', () => {
  const flags = new Set();
  for (let seed = 1; seed <= 40; seed++) for (const o of observations(oruParsed({ seed }))) flags.add(get({ segments: [o], delims: oruParsed().delims, text: '' }, 'OBX-8'));
  assert.ok(flags.has('N') && flags.has('H') && flags.has('L'));
});

test('ORU^R01 has the same patient, visit and doctor as an ADT message with the same seed', () => {
  const oru = oruParsed({ seed: 'same' });
  const a01 = parseMessage(generate({ type: 'ADT^A01', seed: 'same', now: NOW }).text);
  for (const path of ['PID-3', 'PID-5', 'PID-7', 'PV1-3', 'PV1-7']) assert.strictEqual(get(oru, path), get(a01, path), path);
});

test('ORU^R01 manual values', () => {
  const m = oruParsed({ fields: { resultValue: '999', resultStatus: 'P', orderControl: 'RE', placerOrderNumber: 'P-9' } });
  const first = observations(m)[0];
  assert.strictEqual(get(m, 'OBX-5'), '999');
  assert.strictEqual(get(m, 'OBX-8'), 'H');
  assert.strictEqual(get(m, 'OBX-11'), 'P');
  assert.strictEqual(get(m, 'OBR-25'), 'P');
  assert.strictEqual(get(m, 'ORC-2.1'), 'P-9');
  assert.ok(first);
  // other results keep their values
  const plain = oruParsed();
  assert.strictEqual(get(m, 'OBX[2]-5'), get(plain, 'OBX[2]-5'));
  // a known panel code switches the tests; an empty value leaves value and flag empty
  const lipid = oruParsed({ fields: { serviceCode: '57698-3', resultValue: null } });
  assert.strictEqual(get(lipid, 'OBR-4'), '57698-3^Lipid panel with direct LDL - Serum or Plasma^LN');
  assert.strictEqual(observations(lipid).length, 4);
  assert.strictEqual(get(lipid, 'OBX-5'), '');
  assert.strictEqual(get(lipid, 'OBX-8'), '');
  // a text value is sent as typed and has no flag
  assert.strictEqual(get(oruParsed({ fields: { resultValue: 'abc' } }), 'OBX-8'), '');
});

test('the explanation of results counts them and the flagged ones', () => {
  const e = explain(generate({ type: 'ORU^R01', seed: 6, now: NOW }).text);
  assert.match(e.narrative, /Delivers \d+ observation results/);
  assert.ok(e.facts.some((x) => x.label === 'Results' && /flagged abnormal/.test(x.value)));
});

/* ---- ACK ---- */

const sourceMessage = (type = 'ADT^A01', version = '2.5.1') => generate({ type, version, seed: 31, now: NOW }).text;
const ackOf = (source, extra = {}) => generate({ type: 'ACK', source, now: NOW, seed: 1, ...extra });

test('an ACK answers the message it is given, with sender and receiver swapped', () => {
  const source = sourceMessage();
  const original = parseMessage(source);
  const r = ackOf(source);
  const m = parseMessage(r.text);
  assert.strictEqual(r.type, 'ACK');
  assert.deepStrictEqual(m.segments.map((s) => s.name), ['MSH', 'MSA']);
  assert.strictEqual(get(m, 'MSH-9'), 'ACK^A01^ACK');
  assert.strictEqual(get(m, 'MSA-1'), 'AA');
  assert.strictEqual(get(m, 'MSA-2'), get(original, 'MSH-10'));
  assert.strictEqual(get(m, 'MSH-3'), get(original, 'MSH-5'));
  assert.strictEqual(get(m, 'MSH-4'), get(original, 'MSH-6'));
  assert.strictEqual(get(m, 'MSH-5'), get(original, 'MSH-3'));
  assert.strictEqual(get(m, 'MSH-6'), get(original, 'MSH-4'));
  assert.strictEqual(get(m, 'MSH-12'), get(original, 'MSH-12'));
  assert.notStrictEqual(get(m, 'MSH-10'), get(original, 'MSH-10'));
  assert.deepStrictEqual(validate(r.text).issues, []);
  assert.strictEqual(r.text.endsWith('|'), false);
});

test('an ACK works for every message type and version', () => {
  for (const type of ['ADT^A01', 'ADT^A18', 'ADT^A60', 'ORM^O01', 'ORU^R01']) {
    for (const version of VERSIONS) {
      const r = ackOf(sourceMessage(type, version));
      const m = parseMessage(r.text);
      assert.strictEqual(get(m, 'MSH-12'), version, `${type} v${version}`);
      assert.strictEqual(get(m, 'MSH-9.2'), type.split('^')[1]);
      assert.strictEqual(get(m, 'MSH-9.3'), compare(version, '2.4') ? 'ACK' : '', `${type} v${version}`);
      assert.deepStrictEqual(validate(r.text).issues, [], `${type} v${version}`);
    }
  }
});

function compare(version, minimum) {
  const [a, b] = [version, minimum].map((v) => v.split('.').map(Number));
  return a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1]);
}

test('error acknowledgments carry an ERR segment in the form of the version', () => {
  for (const code of ['AE', 'AR', 'CE', 'CR']) {
    const modern = parseMessage(ackOf(sourceMessage(), { fields: { ackCode: code } }).text);
    assert.strictEqual(get(modern, 'MSA-1'), code);
    assert.strictEqual(get(modern, 'ERR-3'), '207^Application internal error^HL70357');
    assert.strictEqual(get(modern, 'ERR-4'), 'E');
    assert.ok(get(modern, 'ERR-7') !== '' && get(modern, 'ERR-7') === get(modern, 'MSA-3'));
    const old = ackOf(sourceMessage('ADT^A01', '2.3'), { fields: { ackCode: code } });
    assert.strictEqual(get(parseMessage(old.text), 'ERR-1'), 'MSH^1^9^207&Application internal error&HL70357');
    assert.deepStrictEqual(validate(old.text).issues, []);
  }
  for (const code of ['AA', 'CA']) {
    assert.deepStrictEqual(parseMessage(ackOf(sourceMessage(), { fields: { ackCode: code } }).text).segments.map((s) => s.name), ['MSH', 'MSA']);
  }
});

test('ACK manual values', () => {
  const m = parseMessage(ackOf(sourceMessage(), { fields: { ackCode: 'AR', errorCode: '200', errorText: 'Not supported here', ackControlId: 'OTHER-1' } }).text);
  assert.strictEqual(get(m, 'ERR-3'), '200^Unsupported message type^HL70357');
  assert.strictEqual(get(m, 'ERR-7'), 'Not supported here');
  assert.strictEqual(get(m, 'MSA-3'), 'Not supported here');
  assert.strictEqual(get(m, 'MSA-2'), 'OTHER-1');
  const empty = parseMessage(ackOf(sourceMessage(), { fields: { ackCode: null, ackControlId: null } }).text);
  assert.strictEqual(get(empty, 'MSA-1'), '');
  assert.strictEqual(get(empty, 'MSA-2'), '');
  assert.strictEqual(get(parseMessage(ackOf(sourceMessage(), { fields: { errorCode: '999', ackCode: 'AE' } }).text), 'ERR-3'), '999');
});

test('an ACK needs a message with an MSH segment to answer', () => {
  assert.throws(() => ackOf(''), /put the message you want to answer in the editor/);
  assert.throws(() => ackOf('   \n'), /put the message/);
  assert.throws(() => ackOf('PID|1||123'), /no MSH segment/);
  assert.throws(() => generate({ type: 'ACK' }), /put the message/);
});

test('an ACK for a message with missing parts still comes out', () => {
  const m = parseMessage(ackOf('MSH|^~\\&|||||||ADT^A01').text);
  // without sender and receiver in the original, the generator's own sender and receiver are used
  assert.strictEqual(get(m, 'MSH-3'), 'HIS');
  assert.strictEqual(get(m, 'MSH-5'), 'EHR');
  assert.strictEqual(get(m, 'MSA-2'), '');
  assert.strictEqual(get(m, 'MSH-12'), '2.5.1');
});

test('the explanation of an ACK shows the code and the error', () => {
  const e = explain(ackOf(sourceMessage(), { fields: { ackCode: 'AE' } }).text);
  assert.match(e.narrative, /Acknowledges message .* with AE/);
  const labels = e.facts.map((x) => x.label);
  assert.ok(['Acknowledgment', 'Answers message', 'Error', 'Error text'].every((l) => labels.includes(l)));
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
  assert.strictEqual(get(a02, 'PV1-6'), 'ER^12^B^SENDHOSP');
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
    // IAM-1 (set ID) and IAM-6 (action code) are part of the structure; everything else is emptied
    const structural = { IAM: new Set([1, 6]) };
    for (const name of ['PID', 'PV1', 'MRG', 'IAM']) {
      const seg = m.segments.find((s) => s.name === name);
      if (!seg) continue;
      const skip = structural[name] ?? new Set([1]);
      const filled = seg.fields.map((f, i) => (!skip.has(i) && f && f.raw !== '' ? `${name}-${i}=${f.raw}` : null)).filter(Boolean);
      assert.deepStrictEqual(filled, [], `${event} ${name}`);
    }
    const extra = ['A18', 'A40', 'A60'].includes(event) ? 1 : 0;
    assert.strictEqual(m.segments.length, 4 + extra);
    assert.ok(get(m, 'MSH-10') !== '' && get(m, 'EVN-2') !== '');
  }
});
