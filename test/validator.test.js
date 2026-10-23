'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { parseMessage, get, unescape } = require('../src/hl7/parser');
const { validate } = require('../src/hl7/validator');

const ADT = [
  'MSH|^~\\&|HIS|MAIN|EHR|MAIN|20261023120000||ADT^A01^ADT_A01|MSG1|T|2.5.1',
  'EVN|A01|20261023120000',
  'PID|1||123^^^MAIN^MR||DOE^JOHN^A||19800412|M',
  'PV1|1|I|ICU^101^A',
];

const ORU = [
  'MSH|^~\\&|LAB|MAIN|EHR|MAIN|20261023120500||ORU^R01^ORU_R01|MSG2|T|2.5.1',
  'PID|1||123^^^MAIN^MR||DOE^JOHN||19800412|M',
  'OBR|1|P100^EMR|F100^LAB|2951-2^Sodium^LN|||20261023110000',
  'OBX|1|NM|2951-2^Sodium^LN||140|mmol/L|135-145|N|||F',
];

const rules = (result) => result.issues.map((i) => `${i.rule}:${i.path}`);

test('parser reads fields and components by path', () => {
  const msg = parseMessage(ADT.join('\r'));
  assert.strictEqual(get(msg, 'MSH-9.2'), 'A01');
  assert.strictEqual(get(msg, 'PID-5.1'), 'DOE');
  assert.strictEqual(get(msg, 'PID-5.2'), 'JOHN');
  assert.strictEqual(get(msg, 'PID-99'), '');
});

test('unescape handles HL7 escape sequences', () => {
  assert.strictEqual(unescape('a\\F\\b\\S\\c'), 'a|b^c');
  assert.strictEqual(unescape('x\\.br\\y'), 'x\ny');
});

test('a correct ADT message has no issues', () => {
  const r = validate(ADT.join('\n'));
  assert.deepStrictEqual(rules(r), []);
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.messageType, 'ADT^A01');
});

test('a correct ORU message has no issues', () => {
  assert.deepStrictEqual(rules(validate(ORU.join('\n'))), []);
});

test('CR, LF and CRLF line endings all work', () => {
  for (const eol of ['\r', '\n', '\r\n']) {
    assert.strictEqual(validate(ADT.join(eol)).valid, true);
  }
});

test('empty input is reported', () => {
  assert.deepStrictEqual(rules(validate('   \n')), ['EMPTY_MESSAGE:']);
});

test('a message that does not start with MSH is an error', () => {
  const r = validate(ADT.slice(1).join('\n'));
  assert.ok(rules(r).includes('MSH_FIRST:EVN'));
});

test('an empty required field is reported with its path and line', () => {
  const lines = [...ADT];
  lines[2] = 'PID|1||123^^^MAIN^MR||||19800412|M';
  const r = validate(lines.join('\n'));
  const issue = r.issues.find((i) => i.path === 'PID-5');
  assert.ok(issue);
  assert.strictEqual(issue.rule, 'REQUIRED_FIELD');
  assert.strictEqual(issue.line, 3);
});

test('an invalid date is reported', () => {
  const lines = [...ADT];
  lines[2] = lines[2].replace('19800412', '19801345');
  assert.ok(rules(validate(lines.join('\n'))).includes('DATA_TYPE:PID-7'));
});

test('OBX-5 must be numeric when OBX-2 is NM', () => {
  const lines = [...ORU];
  lines[3] = lines[3].replace('||140|', '||abc|');
  assert.ok(rules(validate(lines.join('\n'))).includes('DATA_TYPE:OBX-5'));
});

test('a required segment that is missing is reported', () => {
  const r = validate([ADT[0], ADT[1], ADT[2]].join('\n'));
  assert.ok(r.issues.some((i) => i.rule === 'MISSING_SEGMENT' && /PV1/.test(i.message)));
});

test('several messages pasted together are flagged', () => {
  assert.ok(rules(validate([...ADT, ...ADT].join('\n'))).includes('MULTIPLE_MSH:MSH'));
});

/* ---- spaces ---- */

test('a trailing space in the message type is only a note and does not change the result', () => {
  const lines = [...ADT];
  lines[0] = lines[0].replace('ADT^A01^ADT_A01', 'ADT^A01 ^ADT_A01');
  const r = validate(lines.join('\n'));
  assert.strictEqual(r.valid, true);
  assert.strictEqual(r.messageType, 'ADT^A01');
  const issue = r.issues.find((i) => i.rule === 'TRAILING_SPACE');
  assert.ok(issue);
  assert.strictEqual(issue.path, 'MSH-9.2');
  assert.strictEqual(issue.severity, 'info');
});

test('trailing spaces do not break date or number checks', () => {
  const adt = [...ADT];
  adt[2] = adt[2].replace('19800412', '19800412 ');
  assert.deepStrictEqual(rules(validate(adt.join('\n'))), ['TRAILING_SPACE:PID-7']);

  const oru = [...ORU];
  oru[3] = oru[3].replace('||140|', '||140 |');
  assert.deepStrictEqual(rules(validate(oru.join('\n'))), ['TRAILING_SPACE:OBX-5']);
});

test('a trailing space at the end of a segment line is noted', () => {
  const lines = [...ADT];
  lines[3] = `${lines[3]}  `;
  assert.ok(rules(validate(lines.join('\n'))).includes('TRAILING_SPACE:PV1-3.3'));
});

test('a leading space is a warning, not an error', () => {
  const lines = [...ADT];
  lines[2] = lines[2].replace('DOE^JOHN^A', ' DOE^JOHN^A');
  const r = validate(lines.join('\n'));
  assert.strictEqual(r.valid, true);
  const issue = r.issues.find((i) => i.rule === 'LEADING_SPACE');
  assert.ok(issue);
  assert.strictEqual(issue.path, 'PID-5.1');
  assert.strictEqual(issue.severity, 'warning');
});

test('a required field that only contains spaces counts as empty', () => {
  const lines = [...ADT];
  lines[2] = lines[2].replace('DOE^JOHN^A', '   ');
  const r = validate(lines.join('\n'));
  assert.ok(rules(r).includes('REQUIRED_FIELD:PID-5'));
  assert.ok(rules(r).includes('SPACES_ONLY:PID-5'));
});

test('leading spaces in OBX-5 free text are not reported', () => {
  const lines = [...ORU];
  lines[3] = lines[3].replace('|NM|', '|TX|').replace('||140|', '||  indented text|');
  assert.ok(!rules(validate(lines.join('\n'))).includes('LEADING_SPACE:OBX-5'));
});

/* ---- segment counts ---- */

test('a segment that may appear only once is flagged when repeated', () => {
  const r = validate([...ADT, 'PID|2||456^^^MAIN^MR||ROE^JANE'].join('\n'));
  const issue = r.issues.find((i) => i.rule === 'TOO_MANY_SEGMENTS');
  assert.ok(issue);
  assert.strictEqual(issue.segment, 'PID');
  assert.strictEqual(issue.line, 5);
  assert.match(issue.message, /2 times/);
});

test('every required ADT segment is counted', () => {
  for (const name of ['EVN', 'PID', 'PV1']) {
    const r = validate(ADT.filter((l) => !l.startsWith(name)).join('\n'));
    assert.ok(r.issues.some((i) => i.rule === 'MISSING_SEGMENT' && i.message.includes(`Segment ${name}`)), name);
  }
});

test('an ORU needs at least one OBR but may have many OBX', () => {
  assert.ok(rules(validate(ORU.filter((l) => !l.startsWith('OBR')).join('\n'))).includes('MISSING_SEGMENT:MSH'));
  const many = [...ORU, 'OBX|2|NM|2823-3^Potassium^LN||4.1|mmol/L|3.5-5.1|N|||F', 'OBX|3|NM|2075-0^Chloride^LN||101|mmol/L|98-107|N|||F'];
  assert.deepStrictEqual(rules(validate(many.join('\n'))), []);
});

test('an ACK must have exactly one MSA', () => {
  const ack = [
    'MSH|^~\\&|EHR|MAIN|HIS|MAIN|20261023120100||ACK^A01|ACK1|T|2.5.1',
    'MSA|AA|MSG1',
  ];
  assert.deepStrictEqual(rules(validate(ack.join('\n'))), []);
  assert.ok(rules(validate([...ack, 'MSA|AA|MSG1'].join('\n'))).includes('TOO_MANY_SEGMENTS:MSA'));
  assert.ok(rules(validate(ack.slice(0, 1).join('\n'))).includes('MISSING_SEGMENT:MSH'));
});

test('an ORM may have several orders but only one PID', () => {
  const orm = [
    'MSH|^~\\&|EMR|MAIN|LAB|MAIN|20261023120000||ORM^O01^ORM_O01|MSG3|T|2.5.1',
    'PID|1||123^^^MAIN^MR||DOE^JOHN',
    'ORC|NW|P1^EMR',
    'OBR|1|P1^EMR||2951-2^Sodium^LN',
    'ORC|NW|P2^EMR',
    'OBR|2|P2^EMR||2823-3^Potassium^LN',
  ];
  assert.deepStrictEqual(rules(validate(orm.join('\n'))), []);
  assert.ok(rules(validate([...orm, 'PID|2||9^^^MAIN^MR||X^Y'].join('\n'))).includes('TOO_MANY_SEGMENTS:PID'));
});
