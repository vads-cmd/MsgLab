'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { explain, prettyDtm } = require('../src/hl7/explainer');

const ADT = [
  'MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01^ADT_A01|MSG1|T|2.5.1',
  'EVN|A01|20261023120000',
  'PID|1||123^^^MAIN^MR||DOE^JOHN^A||19800412|M|||12 Oak St^^Springfield^IL^62701^USA^H',
  'PV1|1|I|ICU^101^A^MAIN||||1234^WILSON^KAREN',
];

const ORU = [
  'MSH|^~\\&|LAB|MAIN|EHR|MAIN|20261023120500||ORU^R01^ORU_R01|MSG2|T|2.5.1',
  'PID|1||123^^^MAIN^MR||DOE^JOHN||19800412|M',
  'OBR|1|P100^EMR|F100^LAB|2951-2^Sodium^LN|||20261023110000',
  'OBX|1|NM|2951-2^Sodium^LN||140|mmol/L|135-145|N|||F',
  'OBX|2|NM|2823-3^Potassium^LN||5.9|mmol/L|3.5-5.1|H|||F',
];

const fact = (result, label) => (result.facts.find((f) => f.label === label) || {}).value;
const field = (result, path) => {
  const [seg] = path.split('-');
  return result.segments.find((s) => s.name === seg).fields.find((f) => f.path === path);
};

test('dates are shown in a readable form', () => {
  assert.strictEqual(prettyDtm('20261023120000'), '2026-10-23 12:00:00');
  assert.strictEqual(prettyDtm('19800412'), '1980-04-12');
  assert.strictEqual(prettyDtm('202610'), '2026-10');
});

test('an ADT message is summarised', () => {
  const r = explain(ADT.join('\n'));
  assert.strictEqual(r.messageType, 'ADT^A01');
  assert.strictEqual(fact(r, 'Message type'), 'ADT^A01 - Admit/Visit Notification');
  assert.strictEqual(fact(r, 'Patient'), 'DOE, JOHN A');
  assert.strictEqual(fact(r, 'Patient ID'), '123 (MR) @ MAIN');
  assert.strictEqual(fact(r, 'Sex'), 'M (Male)');
  assert.strictEqual(fact(r, 'Born'), '1980-04-12');
  assert.strictEqual(fact(r, 'Patient class'), 'I (Inpatient)');
  assert.strictEqual(fact(r, 'Location'), 'ICU / 101 / A / MAIN');
  assert.match(r.narrative, /was admitted \(patient class: Inpatient\)/);
});

test('fields get their names, readable values and decoded components', () => {
  const r = explain(ADT.join('\n'));
  assert.strictEqual(field(r, 'PID-5').name, 'Patient Name');
  assert.strictEqual(field(r, 'PID-5').display, 'DOE, JOHN A');
  assert.strictEqual(field(r, 'PID-8').display, 'M (Male)');
  const id = field(r, 'PID-3').reps[0].components.find((c) => c.n === 5);
  assert.strictEqual(id.name, 'Identifier Type Code');
  assert.strictEqual(id.decoded, 'Medical record number');
});

test('field offsets point at the original text', () => {
  const text = ADT.join('\n');
  const r = explain(text);
  const f = field(r, 'PID-5');
  assert.strictEqual(text.slice(f.start, f.end), 'DOE^JOHN^A');
});

test('an ORU message lists its results and flags', () => {
  const r = explain(ORU.join('\n'));
  assert.strictEqual(fact(r, 'Order'), 'Sodium [2951-2 LN]');
  assert.strictEqual(fact(r, 'Results'), '2 observations, 1 flagged abnormal');
  const obx = r.segments.filter((s) => s.name === 'OBX')[1];
  assert.strictEqual(obx.fields.find((f) => f.path === 'OBX-8').display, 'H (High)');
  assert.strictEqual(obx.fields.find((f) => f.path === 'OBX-11').display, 'F (Final results)');
  assert.match(r.narrative, /2 observation results/);
});

test('an ACK is explained', () => {
  const r = explain([
    'MSH|^~\\&|EHR|MAIN|HIS|MAIN|20261023120100||ACK^A01|ACK1|T|2.5.1',
    'MSA|AA|MSG1',
  ].join('\n'));
  assert.match(r.narrative, /Acknowledges message MSG1 with AA \(Application Accept\)/);
});

test('trailing spaces are ignored', () => {
  const lines = [...ADT];
  lines[0] = lines[0].replace('ADT^A01^ADT_A01', 'ADT^A01 ^ADT_A01');
  assert.strictEqual(explain(lines.join('\n')).messageType, 'ADT^A01');
});

test('unknown segments and fields still show up', () => {
  const r = explain([...ADT, 'ZZZ|custom|value'].join('\n'));
  const zzz = r.segments.find((s) => s.name === 'ZZZ');
  assert.strictEqual(zzz.known, false);
  assert.deepStrictEqual(zzz.fields.map((f) => [f.name, f.display]), [['Field 1', 'custom'], ['Field 2', 'value']]);
});

test('empty input gives an empty explanation', () => {
  assert.strictEqual(explain('  \n').empty, true);
});
