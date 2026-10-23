'use strict';

/**
 * Bulk generation: many messages at once, for filling an empty test database.
 *
 * Two ways to choose the patients:
 *  - independent: every message is for a new patient;
 *  - journey: each patient gets the selected events one after another in a sensible order
 *    (admit, order, result, allergy, update, transfer, discharge), so a receiving system
 *    never sees a discharge for a patient it has not seen admitted.
 *
 * Messages are spaced in time and end at "now". The same seed gives the same messages.
 */

const { generate, TYPES, timestamp } = require('./generator');

const MAX_COUNT = 5000;
const MODES = new Set(['independent', 'journey']);
const BULK_TYPES = Object.keys(TYPES).filter((type) => type !== 'ACK');
// The order of events in one patient's stay
const JOURNEY_ORDER = ['ADT^A01', 'ORM^O01', 'ORU^R01', 'ADT^A60', 'ADT^A08', 'ADT^A02', 'ADT^A03', 'ADT^A18', 'ADT^A40'];

function readOptions(raw) {
  const count = Number(raw.count);
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
    throw new Error(`The number of messages must be a whole number from 1 to ${MAX_COUNT}.`);
  }
  const types = [...new Set(Array.isArray(raw.types) ? raw.types : [])];
  if (types.length === 0) throw new Error('Choose at least one message type.');
  const unknown = types.find((type) => !BULK_TYPES.includes(type));
  if (unknown !== undefined) throw new Error(`Unsupported message type for bulk generation: ${unknown}`);
  const mode = raw.mode ?? 'independent';
  if (!MODES.has(mode)) throw new Error(`Unknown mode: ${mode}`);
  const minutes = raw.minutesBetween === undefined || raw.minutesBetween === '' ? 5 : Number(raw.minutesBetween);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) {
    throw new Error('Minutes between messages must be a number from 0 to 1440.');
  }
  const seedText = raw.seed === undefined || raw.seed === null ? '' : String(raw.seed).trim();
  const seed = seedText === '' ? String(Math.floor(Math.random() * 4294967296)) : seedText; // NOSONAR: only picks a seed for test data, nothing security related
  return { count, types, mode, minutes, seed };
}

/** Which event and which patient each message is for. */
function planMessages({ count, types, mode }) {
  if (mode === 'independent') {
    return Array.from({ length: count }, (_, i) => ({ type: types[i % types.length], patient: i, journeyStart: i }));
  }
  const ordered = JOURNEY_ORDER.filter((type) => types.includes(type));
  return Array.from({ length: count }, (_, i) => {
    const patient = Math.floor(i / ordered.length);
    return { type: ordered[i % ordered.length], patient, journeyStart: patient * ordered.length };
  });
}

/** "Family, Given" from the PID segment. */
function patientLabel(text) {
  const pid = text.split('\n').find((line) => line.startsWith('PID|'));
  if (!pid) return '';
  const [family = '', given = ''] = (pid.split('|')[5] ?? '').split('^');
  return [family, given].filter(Boolean).join(', ');
}

function generateBulk(raw = {}) {
  const options = readOptions(raw);
  const plan = planMessages(options);
  const step = options.minutes * 60000;
  const end = (raw.now instanceof Date ? raw.now : new Date()).getTime();
  const start = end - (options.count - 1) * step;
  const common = {
    version: raw.version,
    sendingApp: raw.sendingApp,
    sendingFacility: raw.sendingFacility,
    receivingApp: raw.receivingApp,
    receivingFacility: raw.receivingFacility,
    processingId: raw.processingId,
  };

  const messages = plan.map((slot, i) => {
    const when = new Date(start + i * step);
    const stamp = timestamp(when);
    const controlId = `MSG${stamp}${String(i + 1).padStart(5, '0')}`;
    // Every message of one stay shows the same admit time: the time of the stay's first message
    const admitTime = timestamp(new Date(start + slot.journeyStart * step));
    const result = generate({
      ...common,
      type: slot.type,
      seed: `${options.seed}-${slot.patient + 1}`,
      now: when,
      controlId,
      fields: { admitTime },
    });
    return { text: result.text, type: slot.type, controlId, patient: patientLabel(result.text), time: stamp };
  });

  return {
    seed: options.seed,
    count: options.count,
    patients: new Set(plan.map((slot) => slot.patient)).size,
    messages,
  };
}

module.exports = { generateBulk, BULK_TYPES, MAX_COUNT };
