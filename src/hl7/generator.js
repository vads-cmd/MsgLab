'use strict';

/**
 * Generates HL7 v2 test messages with made-up data.
 * The same seed (and the same time) always gives the same message.
 */

const { parseMessage, get } = require('./parser');

const TYPES = {
  'ADT^A01': 'Admit/Visit Notification',
  'ADT^A02': 'Transfer a Patient',
  'ADT^A03': 'Discharge/End Visit',
  'ADT^A08': 'Update Patient Information',
  'ADT^A18': 'Merge Patient Information',
  'ADT^A40': 'Merge Patient - Patient Identifier List',
  'ADT^A60': 'Update Adverse Reaction Information',
  'ORM^O01': 'General Order Message',
  'ORU^R01': 'Unsolicited Observation Result',
  ACK: 'General Acknowledgment (reply to the message in the editor)',
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
// [code, name, allergen type] - types are from HL7 table 0127
const ALLERGENS = [['PCN', 'Penicillin', 'DA'], ['SULF', 'Sulfonamides', 'DA'], ['ASA', 'Aspirin', 'DA'], ['PNUT', 'Peanuts', 'FA'], ['SHELL', 'Shellfish', 'FA'], ['LATEX', 'Latex', 'MA'], ['POLLEN', 'Pollen', 'EA']];
// [code, name, coding system] of the ordered tests (LN = LOINC)
const SERVICES = [
  ['24323-8', 'Comprehensive metabolic panel', 'LN'], ['58410-2', 'CBC panel - Blood by Automated count', 'LN'],
  ['24356-8', 'Urinalysis complete panel - Urine', 'LN'], ['57698-3', 'Lipid panel with direct LDL - Serum or Plasma', 'LN'],
  ['3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma', 'LN'], ['36643-5', 'Chest X-ray 1 view', 'LN'],
];
// Lab panels for ORU results. Each test: LOINC code, name, unit, [normal low, normal high], [lowest, highest], decimals.
// The lowest and highest values are wider than the normal range, so some results come out flagged.
const test = (code, name, unit, [low, high], [min, max], decimals = 0) => ({ code, name, unit, low, high, min, max, decimals });
const PANELS = [
  {
    code: '51990-0', name: 'Basic metabolic panel - Blood',
    tests: [
      test('2345-7', 'Glucose', 'mg/dL', [70, 99], [55, 150]), test('2951-2', 'Sodium', 'mmol/L', [136, 145], [130, 150]),
      test('2823-3', 'Potassium', 'mmol/L', [3.5, 5.1], [3, 5.8], 1), test('2075-0', 'Chloride', 'mmol/L', [98, 107], [92, 112]),
      test('2028-9', 'Carbon dioxide', 'mmol/L', [22, 29], [19, 33]), test('3094-0', 'Urea nitrogen', 'mg/dL', [7, 20], [5, 26]),
      test('2160-0', 'Creatinine', 'mg/dL', [0.6, 1.3], [0.5, 1.6], 1),
    ],
  },
  {
    code: '58410-2', name: 'CBC panel - Blood by Automated count',
    tests: [
      test('6690-2', 'Leukocytes', '10*3/uL', [4, 11], [3, 14], 1), test('789-8', 'Erythrocytes', '10*6/uL', [4.2, 5.9], [3.8, 6.3], 1),
      test('718-7', 'Hemoglobin', 'g/dL', [12, 17.5], [10.5, 18.5], 1), test('4544-3', 'Hematocrit', '%', [36, 52], [32, 55]),
      test('777-3', 'Platelets', '10*3/uL', [150, 400], [120, 450]),
    ],
  },
  {
    code: '57698-3', name: 'Lipid panel with direct LDL - Serum or Plasma',
    tests: [
      test('2093-3', 'Cholesterol', 'mg/dL', [125, 200], [110, 250]), test('2085-9', 'HDL cholesterol', 'mg/dL', [40, 60], [30, 75]),
      test('18262-6', 'LDL cholesterol', 'mg/dL', [0, 100], [60, 150]), test('2571-8', 'Triglycerides', 'mg/dL', [0, 150], [60, 220]),
    ],
  },
];
const MAX_TESTS = Math.max(...PANELS.map((p) => p.tests.length));
const ORDER_REASONS = ['Routine check', 'Pre-operative testing', 'Follow-up', 'Chest pain', 'Fatigue'];
const REACTIONS = ['Rash', 'Hives', 'Nausea', 'Swelling', 'Shortness of breath', 'Anaphylaxis'];
// Code lists for the allergy fields (HL7 tables 0127 and 0128)
const ALLERGY_TYPES = { AA: 'Animal Allergy', DA: 'Drug allergy', EA: 'Environmental Allergy', FA: 'Food allergy', LA: 'Pollen Allergy', MA: 'Miscellaneous allergy', MC: 'Miscellaneous contraindication', PA: 'Plant Allergy' };
const SEVERITIES = { SV: 'Severe', MO: 'Moderate', MI: 'Mild', U: 'Unknown' };

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
  let a = seed | 0; // NOSONAR: wraps to a 32-bit integer on purpose (Math.trunc would not)
  return function next() {
    a = (a + 0x6d2b79f5) | 0; // NOSONAR: wraps to a 32-bit integer on purpose
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
    .replaceAll(/[\r\n\t]+/g, ' ')
    .replaceAll('\\', '\\E\\')
    .replaceAll('|', '\\F\\')
    .replaceAll('^', '\\S\\')
    .replaceAll('~', '\\R\\')
    .replaceAll('&', '\\T\\');
}

function cleanName(value, fallback) {
  const text = String(value == null ? '' : value).replaceAll(/[\r\n\t]+/g, ' ').trim().slice(0, 60);
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
  'priorPatientId', 'priorFamilyName', 'priorGivenName',
  'allergen', 'allergyType', 'allergySeverity',
  'orderControl', 'placerOrderNumber', 'fillerOrderNumber', 'serviceCode', 'serviceName', 'orderTime', 'orderReason',
  'resultStatus', 'resultValue',
  'ackCode', 'errorCode', 'errorText', 'ackControlId',
];

function manualValues(raw) {
  const out = {};
  if (raw === undefined || raw === null) return out;
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new TypeError('The manual values must be an object.');
  for (const [key, value] of Object.entries(raw)) {
    if (!MANUAL_FIELDS.includes(key)) throw new Error(`Unknown manual field: ${key}`);
    if (value === null) {
      out[key] = null;
    } else if (typeof value === 'string') {
      const text = value.replaceAll(/[\r\n\t]+/g, ' ').trim().slice(0, 80);
      if (text !== '') out[key] = text;
    } else {
      throw new TypeError(`Manual field ${key} must be text or null.`);
    }
  }
  return out;
}

const allEmpty = (...values) => values.every((v) => v === '');

/* ---- ADT messages (A01 admit, A02 transfer, A03 discharge, A08 update, A18/A40 merge, A60 allergy update) and ORM^O01 orders ---- */

// MSH-9.3 message structure per message type (A08 uses the A01 structure, A40 the A39 structure)
const STRUCTURES = {
  'ADT^A01': 'ADT_A01', 'ADT^A02': 'ADT_A02', 'ADT^A03': 'ADT_A03', 'ADT^A08': 'ADT_A01', 'ADT^A18': 'ADT_A18',
  'ADT^A40': 'ADT_A39', 'ADT^A60': 'ADT_A60', 'ORM^O01': 'ORM_O01', 'ORU^R01': 'ORU_R01',
};
const MERGE_EVENTS = new Set(['A18', 'A40']);

/** Draws every random value in a fixed order, so a seed gives the same patient, visit and doctor in every event type. */
function drawRandom(rng, now, event) {
  const r = {};
  r.sex = rng() < 0.5 ? 'F' : 'M';
  r.given = pick(rng, r.sex === 'F' ? FEMALE : MALE);
  r.family = pick(rng, LAST);
  r.middle = String.fromCodePoint(65 + int(rng, 0, 25));
  const birthYear = now.getFullYear() - int(rng, 19, 90); // age 18 to 90
  r.dob = `${birthYear}${pad(int(rng, 1, 12))}${pad(int(rng, 1, 28))}`;
  [r.city, r.state] = pick(rng, CITIES);
  r.marital = pick(rng, MARITAL);
  r.mrn = `MRN${digits(rng, 7)}`;
  r.account = `ACC${digits(rng, 8)}`;

  const place = () => {
    const [unit, service] = pick(rng, UNITS);
    return { unit, service, room: String(int(rng, 100, 499)), bed: pick(rng, ['A', 'B']) };
  };
  r.here = place();
  r.visit = `V${digits(rng, 8)}`;
  r.doctorGiven = pick(rng, [...FEMALE, ...MALE]);
  r.doctorFamily = pick(rng, LAST);
  r.daysInHospital = int(rng, 1, 6);
  r.street = `${int(rng, 1, 9999)} ${pick(rng, STREETS)}`;
  r.zip = digits(rng, 5);
  r.phone = `(555)555-01${digits(rng, 2)}`;
  r.doctorId = String(int(rng, 1000, 9999));
  // Drawn last, so the other values for a seed are the same in every event type
  r.before = event === 'A02' ? place() : { unit: '', room: '', bed: '' };
  // Only used by the merge and allergy events; drawn after everything else, so older messages stay the same
  r.priorMrn = `MRN${digits(rng, 7)}`;
  r.priorGiven = pick(rng, [...FEMALE, ...MALE]);
  r.priorFamily = pick(rng, LAST);
  r.allergen = pick(rng, ALLERGENS);
  r.severity = pick(rng, Object.keys(SEVERITIES));
  r.reaction = pick(rng, REACTIONS);
  r.service = pick(rng, SERVICES);
  r.orderNumber = digits(rng, 8);
  r.orderReason = pick(rng, ORDER_REASONS);
  return r;
}

/** "DA^Drug allergy^HL70127" for a known code; any other text is sent as typed. */
function codedText(code, names, tableId) {
  return Object.hasOwn(names, code) ? `${code}^${names[code]}^${tableId}` : code;
}

/** The random value, the manual one (escaped), or '' when the field was set to empty. */
function makeUse(manual) {
  return (key, random) => {
    if (!Object.hasOwn(manual, key)) return random;
    return manual[key] === null ? '' : escapeText(manual[key]);
  };
}

/** Each field's final value: the random one, the manual one (escaped), or '' when set to empty. */
function resolveValues(manual, r, event, ts, now) {
  const use = makeUse(manual);
  // Marital status: a typed code gets its name when it is a known code; any other text is sent as typed
  const maritalCode = use('maritalStatus', r.marital[0]);
  const known = MARITAL.find(([code]) => code === maritalCode);
  const allergenCode = use('allergen', r.allergen[0]);
  const knownAllergen = ALLERGENS.find(([code]) => code === allergenCode);
  const allergyTypeCode = use('allergyType', r.allergen[2]);
  const severityCode = use('allergySeverity', r.severity);
  const earlier = timestamp(new Date(now.getTime() - r.daysInHospital * 86400000));
  return {
    family: use('familyName', r.family),
    given: use('givenName', r.given),
    middle: use('middleInitial', r.middle),
    street: use('street', r.street),
    city: use('city', r.city),
    state: use('state', r.state),
    zip: use('zip', r.zip),
    phone: use('phone', r.phone),
    mrn: use('mrn', r.mrn),
    account: use('accountNumber', r.account),
    visit: use('visitNumber', r.visit),
    unit: use('unit', r.here.unit),
    room: use('room', r.here.room),
    bed: use('bed', r.here.bed),
    doctorId: use('doctorId', r.doctorId),
    doctorFamily: use('doctorFamily', r.doctorFamily),
    doctorGiven: use('doctorGiven', r.doctorGiven),
    maritalText: known ? `${maritalCode}^${known[1]}^HL70002` : maritalCode,
    admitTime: use('admitTime', event === 'A01' ? ts : earlier),
    birthDate: use('birthDate', r.dob),
    sex: use('sex', r.sex),
    patientClass: use('patientClass', 'I'),
    admissionType: use('admissionType', 'R'),
    hospitalService: use('hospitalService', r.here.service),
    priorUnit: use('priorUnit', r.before.unit),
    priorRoom: use('priorRoom', r.before.room),
    priorBed: use('priorBed', r.before.bed),
    dischargeDisposition: use('dischargeDisposition', '01'), // 01 = discharged to home or self care
    dischargeTime: use('dischargeTime', ts),
    priorPatientId: use('priorPatientId', r.priorMrn),
    priorFamilyName: use('priorFamilyName', r.priorFamily),
    priorGivenName: use('priorGivenName', r.priorGiven),
    allergen: knownAllergen ? `${allergenCode}^${knownAllergen[1]}^L` : allergenCode,
    allergyType: codedText(allergyTypeCode, ALLERGY_TYPES, 'HL70127'),
    allergySeverity: codedText(severityCode, SEVERITIES, 'HL70128'),
    reaction: r.reaction,
  };
}

/** MSH-9.3 for a message type; every ACK^xxx uses the ACK structure. */
function structureFor(type) {
  if (type.startsWith('ACK^')) return 'ACK';
  return STRUCTURES[type];
}

function buildMsh(type, opt, ts, controlId) {
  const msh = {
    2: String.raw`^~\&`,
    3: opt.sendingApp,
    4: opt.sendingFacility,
    5: opt.receivingApp,
    6: opt.receivingFacility,
    7: ts,
    9: compareVersions(opt.version, '2.4') >= 0 && structureFor(type) ? `${type}^${structureFor(type)}` : type,
    10: controlId,
    11: opt.processingId,
    12: opt.version,
  };
  if (compareVersions(opt.version, '2.3.1') >= 0) {
    msh[15] = 'AL';
    msh[16] = 'NE';
  }
  if (compareVersions(opt.version, '2.5') >= 0) msh[18] = 'UNICODE UTF-8';
  return msh;
}

function buildPv1(event, f, facility) {
  const pv1 = {
    1: '1',
    2: f.patientClass,
    3: allEmpty(f.unit, f.room, f.bed) ? '' : `${f.unit}^${f.room}^${f.bed}^${facility}`,
    4: f.admissionType,
    7: allEmpty(f.doctorId, f.doctorFamily, f.doctorGiven) ? '' : `${f.doctorId}^${f.doctorFamily}^${f.doctorGiven}^^^Dr`,
    10: f.hospitalService,
    19: f.visit === '' ? '' : `${f.visit}^^^${facility}^VN`,
    44: f.admitTime,
  };
  if (event === 'A02') {
    // PV1-6: where the patient came from (PV1-3 is the new place)
    pv1[6] = allEmpty(f.priorUnit, f.priorRoom, f.priorBed) ? '' : `${f.priorUnit}^${f.priorRoom}^${f.priorBed}^${facility}`;
  }
  if (event === 'A03') {
    pv1[36] = f.dischargeDisposition;
    pv1[45] = f.dischargeTime;
  }
  return pv1;
}

function buildPid(f, facility) {
  return {
    1: '1',
    3: f.mrn === '' ? '' : `${f.mrn}^^^${facility}^MR`,
    5: allEmpty(f.family, f.given, f.middle) ? '' : `${f.family}^${f.given}^${f.middle}^^^^L`,
    7: f.birthDate,
    8: f.sex,
    11: allEmpty(f.street, f.city, f.state, f.zip) ? '' : `${f.street}^^${f.city}^${f.state}^${f.zip}^USA^H`,
    13: f.phone === '' ? '' : `${f.phone}^PRN^PH`,
    16: f.maritalText,
    18: f.account === '' ? '' : `${f.account}^^^${facility}^AN`,
  };
}

function buildMrg(f, facility) {
  return {
    1: f.priorPatientId === '' ? '' : `${f.priorPatientId}^^^${facility}^MR`,
    7: allEmpty(f.priorFamilyName, f.priorGivenName) ? '' : `${f.priorFamilyName}^${f.priorGivenName}^^^^^L`,
  };
}

function buildIam(f) {
  const noAllergy = allEmpty(f.allergyType, f.allergen, f.allergySeverity);
  return { 1: '1', 2: f.allergyType, 3: f.allergen, 4: f.allergySeverity, 5: noAllergy ? '' : f.reaction, 6: 'A' };
}

function adt(event, opt, rng, now, controlId) {
  const ts = timestamp(now);
  const facility = opt.sendingFacility;
  // All random numbers are drawn first, so the other fields do not change when one is set by hand.
  const random = drawRandom(rng, now, event);
  const f = resolveValues(opt.fields, random, event, ts, now);

  const segments = [
    mshSegment(buildMsh(`ADT^${event}`, opt, ts, controlId)),
    segment('EVN', { 1: event, 2: ts }),
    segment('PID', buildPid(f, facility)),
  ];
  // A18 and A40 carry the merged-away patient (MRG) before the visit; A60 carries the allergy after it
  if (MERGE_EVENTS.has(event)) segments.push(segment('MRG', buildMrg(f, facility)));
  segments.push(segment('PV1', buildPv1(event, f, facility)));
  if (event === 'A60') segments.push(segment('IAM', buildIam(f)));
  return segments;
}

/** The order fields: the random value, the manual one, or '' when set to empty. */
function resolveOrderValues(manual, r, ts) {
  const use = makeUse(manual);
  const typedCode = Object.hasOwn(manual, 'serviceCode');
  const code = use('serviceCode', r.service[0]);
  const known = SERVICES.find(([c]) => c === code);
  return {
    orderControl: use('orderControl', 'NW'),
    placerOrderNumber: use('placerOrderNumber', r.orderNumber),
    fillerOrderNumber: use('fillerOrderNumber', ''),
    serviceCode: code,
    // A typed code that we know gets its name; an unknown typed code has no name unless one is typed
    serviceName: use('serviceName', typedCode ? (known?.[1] ?? '') : r.service[1]),
    serviceSystem: known?.[2] ?? 'L',
    orderTime: use('orderTime', ts),
    orderReason: use('orderReason', r.orderReason),
  };
}

/** Placer or filler order number as an EI: "number^application". */
const orderNumber = (value, app) => (value === '' ? '' : `${value}^${app}`);

function buildOrc(o, f, opt) {
  return {
    1: o.orderControl,
    2: orderNumber(o.placerOrderNumber, opt.sendingApp),
    3: orderNumber(o.fillerOrderNumber, opt.receivingApp),
    9: o.orderTime,
    12: allEmpty(f.doctorId, f.doctorFamily, f.doctorGiven) ? '' : `${f.doctorId}^${f.doctorFamily}^${f.doctorGiven}^^^Dr`,
  };
}

function buildObr(o, f, opt) {
  const service = allEmpty(o.serviceCode, o.serviceName) ? '' : `${o.serviceCode}^${o.serviceName}^${o.serviceSystem}`;
  return {
    1: '1',
    2: orderNumber(o.placerOrderNumber, opt.sendingApp),
    3: orderNumber(o.fillerOrderNumber, opt.receivingApp),
    4: service,
    7: o.orderTime,
    16: buildOrc(o, f, opt)[12],
    31: o.orderReason,
  };
}

function orm(opt, rng, now, controlId) {
  const ts = timestamp(now);
  const facility = opt.sendingFacility;
  const random = drawRandom(rng, now, 'O01');
  const f = resolveValues(opt.fields, random, 'O01', ts, now);
  const o = resolveOrderValues(opt.fields, random, ts);
  return [
    mshSegment(buildMsh('ORM^O01', opt, ts, controlId)),
    segment('PID', buildPid(f, facility)),
    segment('PV1', buildPv1('O01', f, facility)),
    segment('ORC', buildOrc(o, f, opt)),
    segment('OBR', buildObr(o, f, opt)),
  ];
}

/* ---- ORU^R01 lab results ---- */

/** Random numbers for the results, drawn after everything else so other messages are not affected. */
function drawResults(rng) {
  return {
    panel: pick(rng, PANELS),
    draws: Array.from({ length: MAX_TESTS }, () => rng()),
    fillerNumber: digits(rng, 8),
  };
}

/** L (below normal), H (above normal) or N; empty when the value is not a number. */
function abnormalFlag(value, t) {
  const number = Number(value);
  if (value === '' || Number.isNaN(number)) return '';
  if (number < t.low) return 'L';
  return number > t.high ? 'H' : 'N';
}

function resolveResultValues(manual, res, orderNumber, ts) {
  const use = makeUse(manual);
  const typedCode = Object.hasOwn(manual, 'serviceCode');
  const code = use('serviceCode', res.panel.code);
  const known = PANELS.find((p) => p.code === code);
  // A typed panel code that we know switches to that panel; the numbers drawn for the results are reused
  const tests = (known ?? res.panel).tests.map((t, i) => {
    const randomValue = (t.min + res.draws[i] * (t.max - t.min)).toFixed(t.decimals);
    const value = i === 0 ? use('resultValue', randomValue) : randomValue;
    return { ...t, value, flag: abnormalFlag(value, t) };
  });
  return {
    orderControl: use('orderControl', 'RE'),
    placerOrderNumber: use('placerOrderNumber', orderNumber),
    fillerOrderNumber: use('fillerOrderNumber', res.fillerNumber),
    serviceCode: code,
    serviceName: use('serviceName', typedCode ? (known?.name ?? '') : res.panel.name),
    serviceSystem: known ? 'LN' : 'L',
    orderTime: use('orderTime', ts),
    status: use('resultStatus', 'F'),
    tests,
  };
}

function buildResultObr(o, f, opt, ts) {
  const obr = { ...buildObr(o, f, opt), 22: ts, 25: o.status };
  delete obr[31]; // no reason for study in a result
  return obr;
}

function buildObx(t, index, o) {
  return {
    1: String(index + 1),
    2: 'NM',
    3: `${t.code}^${t.name}^LN`,
    5: t.value,
    6: t.unit,
    7: `${t.low}-${t.high}`,
    8: t.flag,
    11: o.status,
    14: o.orderTime,
  };
}

function oru(opt, rng, now, controlId) {
  const ts = timestamp(now);
  const facility = opt.sendingFacility;
  const random = drawRandom(rng, now, 'R01');
  const res = drawResults(rng);
  const f = resolveValues(opt.fields, random, 'R01', ts, now);
  const o = resolveResultValues(opt.fields, res, random.orderNumber, ts);
  return [
    mshSegment(buildMsh('ORU^R01', opt, ts, controlId)),
    segment('PID', buildPid(f, facility)),
    segment('PV1', buildPv1('R01', f, facility)),
    segment('ORC', buildOrc(o, f, opt)),
    segment('OBR', buildResultObr(o, f, opt, ts)),
    ...o.tests.map((t, i) => segment('OBX', buildObx(t, i, o))),
  ];
}

/* ---- ACK: the reply to a message ---- */

const ERROR_ACK_CODES = new Set(['AE', 'AR', 'CE', 'CR']);
// HL7 table 0357, the error codes that can be chosen
const ERROR_CODES = {
  100: 'Segment sequence error', 101: 'Required field missing', 102: 'Data type error', 103: 'Table value not found',
  200: 'Unsupported message type', 201: 'Unsupported event code', 202: 'Unsupported processing id', 203: 'Unsupported version id',
  204: 'Unknown key identifier', 205: 'Duplicate key identifier', 206: 'Application record locked', 207: 'Application internal error',
};
const DEFAULT_ERROR_TEXT = { AE: 'Application error', CE: 'Commit error', AR: 'Message rejected', CR: 'Commit reject' };

/** The sender and receiver of the original message swap places in the reply. */
function ackOptions(opt, read) {
  const version = read('MSH-12.1');
  const processingId = read('MSH-11.1');
  return {
    ...opt,
    version: VERSIONS.includes(version) ? version : opt.version,
    processingId: PROCESSING_IDS.includes(processingId) ? processingId : opt.processingId,
    sendingApp: read('MSH-5.1') || opt.sendingApp,
    sendingFacility: read('MSH-6.1') || opt.sendingFacility,
    receivingApp: read('MSH-3.1') || opt.receivingApp,
    receivingFacility: read('MSH-4.1') || opt.receivingFacility,
  };
}

function buildErr(version, code, text) {
  const coded = Object.hasOwn(ERROR_CODES, code) ? `${code}^${ERROR_CODES[code]}^HL70357` : code;
  // Before HL7 2.5 the error is one composite in ERR-1 (segment, sequence, field, error code)
  if (compareVersions(version, '2.5') < 0) {
    return { 1: code === '' ? '' : `MSH^1^9^${code}&${ERROR_CODES[code] ?? ''}&HL70357` };
  }
  return { 3: coded, 4: 'E', 7: text };
}

function ack(opt, now, controlId, source) {
  if (typeof source !== 'string' || source.trim() === '') {
    throw new Error('To create an ACK, put the message you want to answer in the editor first.');
  }
  const original = parseMessage(source);
  if (!original.segments.some((s) => s.name === 'MSH')) {
    throw new Error('The message in the editor has no MSH segment, so there is nothing to answer.');
  }
  const read = (path) => get(original, path).trim();
  const use = makeUse(opt.fields);
  const options = ackOptions(opt, read);
  const ts = timestamp(now);
  const event = read('MSH-9.2');

  const code = use('ackCode', 'AA');
  const text = use('errorText', DEFAULT_ERROR_TEXT[code] ?? '');
  const msa = { 1: code, 2: use('ackControlId', read('MSH-10')) };
  if (text !== '') msa[3] = text;
  const segments = [mshSegment(buildMsh(event ? `ACK^${event}` : 'ACK', options, ts, controlId)), segment('MSA', msa)];
  if (ERROR_ACK_CODES.has(code)) segments.push(segment('ERR', buildErr(options.version, use('errorCode', '207'), text)));
  return segments;
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
    : String(Math.floor(Math.random() * 4294967296)); // NOSONAR: only picks a seed for test data, nothing security related
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
  const generatedId = `MSG${timestamp(now)}${digits(rng, 4)}`;
  // A caller (bulk generation) can supply its own, unique, control ID
  const controlId = raw.controlId ? cleanName(raw.controlId, generatedId) : generatedId;

  const [code, event] = type.split('^');
  const builders = { ORM: orm, ORU: oru, ACK: (o, _rng, n, id) => ack(o, n, id, raw.source) };
  const segments = builders[code] ? builders[code](opt, rng, now, controlId) : adt(event, opt, rng, now, controlId);
  return { text: segments.join(raw.eol || '\n'), type, version, seed: seedText, controlId, manual: Object.keys(opt.fields) };
}

module.exports = { generate, timestamp, TYPES, VERSIONS, PROCESSING_IDS, MANUAL_FIELDS };
