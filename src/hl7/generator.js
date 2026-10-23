'use strict';

/**
 * Generates HL7 v2 test messages with made-up data.
 * The same seed (and the same time) always gives the same message.
 */

const TYPES = {
  'ADT^A01': 'Admit/Visit Notification',
  'ADT^A02': 'Transfer a Patient',
  'ADT^A03': 'Discharge/End Visit',
  'ADT^A08': 'Update Patient Information',
};
const VERSIONS = ['2.3', '2.3.1', '2.4', '2.5', '2.5.1', '2.6', '2.7', '2.8'];
const PROCESSING_IDS = ['T', 'P', 'D'];

const FEMALE = ['Mary', 'Patricia', 'Linda', 'Barbara', 'Elizabeth', 'Jennifer', 'Maria', 'Susan', 'Margaret', 'Dorothy', 'Lisa', 'Nancy', 'Karen', 'Betty', 'Helen'];
const MALE = ['James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Charles', 'Daniel', 'Matthew', 'Anthony', 'Mark', 'Paul'];
const LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee'];
const STREETS = ['Oak St', 'Maple Ave', 'Cedar Ln', 'Pine Rd', 'Elm St', 'Washington Blvd', 'Lake Dr', 'Hill St', 'Park Ave', 'Sunset Way'];
const CITIES = [['Springfield', 'IL'], ['Riverton', 'UT'], ['Fairview', 'OH'], ['Georgetown', 'TX'], ['Franklin', 'TN'], ['Clinton', 'NY'], ['Madison', 'WI']];
const UNITS = [['ICU', 'MED'], ['4W', 'MED'], ['SURG', 'SUR'], ['CARD', 'CAR'], ['ORTH', 'ORT']];
const MARITAL = [['S', 'Single'], ['M', 'Married'], ['D', 'Divorced'], ['W', 'Widowed']];

/* ---- random numbers (seeded) ---- */

function hashSeed(value) {
  // FNV-1a, 32 bit
  let h = 2166136261;
  for (const ch of String(value)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed | 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
const pad = (n, width = 2) => String(n).padStart(width, '0');
const digits = (rng, count) => Array.from({ length: count }, () => Math.floor(rng() * 10)).join('');

/* ---- formatting ---- */

/** Local date and time: YYYYMMDDHHMMSS */
function timestamp(date) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

/** Make user-supplied text safe to place inside a field. */
function escapeText(value) {
  return String(value)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\\/g, '\\E\\')
    .replace(/\|/g, '\\F\\')
    .replace(/\^/g, '\\S\\')
    .replace(/~/g, '\\R\\')
    .replace(/&/g, '\\T\\');
}

function cleanName(value, fallback) {
  const text = String(value == null ? '' : value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
  return escapeText(text === '' ? fallback : text);
}

function compareVersions(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Build "NAME|f1|f2|..." from { fieldNumber: value }. */
function segment(name, fields) {
  const max = Math.max(...Object.keys(fields).map(Number));
  const values = [];
  for (let i = 1; i <= max; i++) values.push(fields[i] === undefined ? '' : fields[i]);
  return `${name}|${values.join('|')}`;
}

/** MSH is special: MSH-1 is the separator itself, so the list starts at MSH-2. */
function mshSegment(fields) {
  const max = Math.max(...Object.keys(fields).map(Number));
  const values = [];
  for (let i = 2; i <= max; i++) values.push(fields[i] === undefined ? '' : fields[i]);
  return `MSH|${values.join('|')}`;
}

/* ---- manual values ---- */

// Fields that can be set by hand. In the options: text = use this value, null = leave the field
// empty, missing or "" = generate a random value.
const MANUAL_FIELDS = [
  'familyName', 'givenName', 'middleInitial', 'birthDate', 'sex', 'street', 'city', 'state', 'zip', 'phone',
  'mrn', 'accountNumber', 'visitNumber',
  'patientClass', 'unit', 'room', 'bed', 'doctorId', 'doctorFamily', 'doctorGiven',
  'priorUnit', 'priorRoom', 'priorBed', 'admitTime', 'dischargeTime',
  'maritalStatus', 'admissionType', 'hospitalService', 'dischargeDisposition',
];

function manualValues(raw) {
  const out = {};
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The manual values must be an object.');
  for (const [key, value] of Object.entries(raw)) {
    if (!MANUAL_FIELDS.includes(key)) throw new Error(`Unknown manual field: ${key}`);
    if (value === null) {
      out[key] = null;
    } else if (typeof value === 'string') {
      const text = value.replace(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
      if (text !== '') out[key] = text;
    } else {
      throw new Error(`Manual field ${key} must be text or null.`);
    }
  }
  return out;
}

const allEmpty = (...values) => values.every((v) => v === '');

/* ---- ADT messages (A01 admit, A02 transfer, A03 discharge, A08 update) ---- */

// MSH-9 message structure per event (A08 uses the A01 structure)
const ADT_STRUCTURES = { A01: 'ADT_A01', A02: 'ADT_A02', A03: 'ADT_A03', A08: 'ADT_A01' };

function adt(event, opt, rng, now, controlId) {
  const ts = timestamp(now);
  const facility = opt.sendingFacility;
  const manual = opt.fields;
  // The random value, the manual value (escaped), or '' when the field was set to empty.
  // All random numbers are drawn first, so the other fields do not change when one is set by hand.
  const use = (key, random) => {
    if (!Object.prototype.hasOwnProperty.call(manual, key)) return random;
    return manual[key] === null ? '' : escapeText(manual[key]);
  };

  // Patient
  const sexRandom = rng() < 0.5 ? 'F' : 'M';
  const givenRandom = pick(rng, sexRandom === 'F' ? FEMALE : MALE);
  const familyRandom = pick(rng, LAST);
  const middleRandom = String.fromCharCode(65 + int(rng, 0, 25));
  const birthYear = now.getFullYear() - int(rng, 19, 90); // age 18 to 90
  const dobRandom = `${birthYear}${pad(int(rng, 1, 12))}${pad(int(rng, 1, 28))}`;
  const [cityRandom, stateRandom] = pick(rng, CITIES);
  const marital = pick(rng, MARITAL);
  const mrnRandom = `MRN${digits(rng, 7)}`;
  const accountRandom = `ACC${digits(rng, 8)}`;

  // Visit
  const place = () => {
    const [unit, service] = pick(rng, UNITS);
    return { unit, service, room: String(int(rng, 100, 499)), bed: pick(rng, ['A', 'B']) };
  };
  const here = place();
  const visitRandom = `V${digits(rng, 8)}`;
  const doctorGivenRandom = pick(rng, [...FEMALE, ...MALE]);
  const doctorFamilyRandom = pick(rng, LAST);
  const daysInHospital = int(rng, 1, 6);
  const streetRandom = `${int(rng, 1, 9999)} ${pick(rng, STREETS)}`;
  const zipRandom = digits(rng, 5);
  const phoneRandom = `(555)555-01${digits(rng, 2)}`;
  const doctorIdRandom = String(int(rng, 1000, 9999));
  // Drawn last, so the patient, visit and doctor for a seed are the same in every event type
  const before = event === 'A02' ? place() : { unit: '', room: '', bed: '' };

  const family = use('familyName', familyRandom);
  const given = use('givenName', givenRandom);
  const middle = use('middleInitial', middleRandom);
  const street = use('street', streetRandom);
  const city = use('city', cityRandom);
  const state = use('state', stateRandom);
  const zip = use('zip', zipRandom);
  const mrn = use('mrn', mrnRandom);
  const account = use('accountNumber', accountRandom);
  const visit = use('visitNumber', visitRandom);
  const unit = use('unit', here.unit);
  const room = use('room', here.room);
  const bed = use('bed', here.bed);
  const doctorId = use('doctorId', doctorIdRandom);
  const doctorFamily = use('doctorFamily', doctorFamilyRandom);
  const doctorGiven = use('doctorGiven', doctorGivenRandom);
  // Marital status: a typed code gets its name when it is a known code; any other text is sent as typed
  const maritalCode = use('maritalStatus', marital[0]);
  const known = MARITAL.find(([code]) => code === maritalCode);
  const maritalText = maritalCode === '' ? '' : (known ? `${maritalCode}^${known[1]}^HL70002` : maritalCode);
  const admitTime = use('admitTime', event === 'A01' ? ts : timestamp(new Date(now.getTime() - daysInHospital * 86400000)));

  const msh = {
    2: '^~\\&',
    3: opt.sendingApp,
    4: opt.sendingFacility,
    5: opt.receivingApp,
    6: opt.receivingFacility,
    7: ts,
    9: compareVersions(opt.version, '2.4') >= 0 ? `ADT^${event}^${ADT_STRUCTURES[event]}` : `ADT^${event}`,
    10: controlId,
    11: opt.processingId,
    12: opt.version,
  };
  if (compareVersions(opt.version, '2.3.1') >= 0) {
    msh[15] = 'AL';
    msh[16] = 'NE';
  }
  if (compareVersions(opt.version, '2.5') >= 0) msh[18] = 'UNICODE UTF-8';

  const pv1 = {
    1: '1',
    2: use('patientClass', 'I'),
    3: allEmpty(unit, room, bed) ? '' : `${unit}^${room}^${bed}^${facility}`,
    4: use('admissionType', 'R'),
    7: allEmpty(doctorId, doctorFamily, doctorGiven) ? '' : `${doctorId}^${doctorFamily}^${doctorGiven}^^^Dr`,
    10: use('hospitalService', here.service),
    19: visit === '' ? '' : `${visit}^^^${facility}^VN`,
    44: admitTime,
  };
  if (event === 'A02') {
    // PV1-6: where the patient came from (PV1-3 is the new place)
    const priorUnit = use('priorUnit', before.unit);
    const priorRoom = use('priorRoom', before.room);
    const priorBed = use('priorBed', before.bed);
    pv1[6] = allEmpty(priorUnit, priorRoom, priorBed) ? '' : `${priorUnit}^${priorRoom}^${priorBed}^${facility}`;
  }
  if (event === 'A03') {
    pv1[36] = use('dischargeDisposition', '01'); // 01 = discharged to home or self care
    pv1[45] = use('dischargeTime', ts);
  }

  return [
    mshSegment(msh),
    segment('EVN', { 1: event, 2: ts }),
    segment('PID', {
      1: '1',
      3: mrn === '' ? '' : `${mrn}^^^${facility}^MR`,
      5: allEmpty(family, given, middle) ? '' : `${family}^${given}^${middle}^^^^L`,
      7: use('birthDate', dobRandom),
      8: use('sex', sexRandom),
      11: allEmpty(street, city, state, zip) ? '' : `${street}^^${city}^${state}^${zip}^USA^H`,
      13: use('phone', phoneRandom) === '' ? '' : `${use('phone', phoneRandom)}^PRN^PH`,
      16: maritalText,
      18: account === '' ? '' : `${account}^^^${facility}^AN`,
    }),
    segment('PV1', pv1),
  ];
}

/**
 * Generate one message.
 * Options: type, version, sendingApp, sendingFacility, receivingApp, receivingFacility,
 *          processingId, seed (number or text; random when empty), now (Date), eol,
 *          fields (manual values, see MANUAL_FIELDS).
 * Returns { text, type, version, seed, controlId, manual } where manual lists the fields set by hand.
 */
function generate(raw = {}) {
  const type = raw.type || 'ADT^A01';
  if (!TYPES[type]) throw new Error(`Unsupported message type: ${type}`);
  const version = raw.version || '2.5.1';
  if (!VERSIONS.includes(version)) throw new Error(`Unsupported HL7 version: ${version}`);
  const processingId = raw.processingId || 'T';
  if (!PROCESSING_IDS.includes(processingId)) throw new Error(`Unsupported processing ID: ${processingId}`);

  const seedText = raw.seed !== undefined && raw.seed !== null && String(raw.seed).trim() !== ''
    ? String(raw.seed).trim()
    : String(Math.floor(Math.random() * 4294967296));
  const seedNumber = /^\d+$/.test(seedText) ? Number(seedText) >>> 0 : hashSeed(seedText);
  const rng = mulberry32(seedNumber);
  const now = raw.now instanceof Date ? raw.now : new Date();

  const opt = {
    version,
    processingId,
    fields: manualValues(raw.fields),
    sendingApp: cleanName(raw.sendingApp, 'HIS'),
    sendingFacility: cleanName(raw.sendingFacility, 'MAINHOSP'),
    receivingApp: cleanName(raw.receivingApp, 'EHR'),
    receivingFacility: cleanName(raw.receivingFacility, 'MAINHOSP'),
  };
  const controlId = `MSG${timestamp(now)}${digits(rng, 4)}`;

  const segments = adt(type.split('^')[1], opt, rng, now, controlId);
  return { text: segments.join(raw.eol || '\n'), type, version, seed: seedText, controlId, manual: Object.keys(opt.fields) };
}

module.exports = { generate, TYPES, VERSIONS, PROCESSING_IDS, MANUAL_FIELDS };
