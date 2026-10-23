'use strict';

const { parseMessage, get, unescape } = require('./parser');
const dict = require('./dictionary');
const tables = require('./tables');

/** "20261023013005" -> "2026-10-23 01:30:05"; keeps whatever precision is present. */
function prettyDtm(value) {
  const m = /^(\d+)(\.\d+)?([+-]\d{4})?$/.exec(value || '');
  // The digits come in pairs after the 4-digit year: 4, 6, 8, 10, 12 or 14 digits.
  if (!m || m[1].length < 4 || m[1].length > 14 || m[1].length % 2 !== 0) return value || '';
  const [, digits, frac, tz] = m;
  const [y, mo, d, h, mi, s] = [digits.slice(0, 4), ...(digits.slice(4).match(/../g) ?? [])];
  let out = y;
  if (mo) out += `-${mo}`;
  if (d) out += `-${d}`;
  if (h) out += ` ${h}:${mi || '00'}`;
  if (h && s) out += `:${s}${frac || ''}`;
  if (tz) out += ` (UTC${tz.slice(0, 3)}:${tz.slice(3)})`;
  return out;
}

const nonEmpty = (list) => list.filter((x) => x !== undefined && x !== null && String(x).trim() !== '');

const prefixed = (prefix, value) => (value ? `${prefix}${value}` : '');
const wrapped = (open, value, close) => (value ? `${open}${value}${close}` : '');

const dateText = (at) => prettyDtm(at(1));
const codedText = (at) => {
  if (!at(2)) return nonEmpty([at(1), at(3)]).join(' ');
  if (!at(1)) return at(2);
  return `${at(2)} [${nonEmpty([at(1), at(3)]).join(' ')}]`;
};

/** Readable one-liners per data type; each gets `at(n)`, the value of component n. */
const REP_SUMMARIES = {
  TS: dateText,
  DTM: dateText,
  DT: dateText,
  XPN: (at) => {
    const given = nonEmpty([at(5), at(2), at(3)]).join(' ');
    const name = nonEmpty([at(1) && given ? `${at(1)},` : at(1), given]).join(' ');
    return nonEmpty([name, at(4)]).join(' ');
  },
  XCN: (at) => {
    const name = nonEmpty([at(6), at(3), at(4), at(2), at(5)]).join(' ');
    return nonEmpty([name, wrapped('[', at(1), ']')]).join(' ');
  },
  XAD: (at) => nonEmpty([at(1), at(2), at(3), nonEmpty([at(4), at(5)]).join(' '), at(6)]).join(', '),
  CX: (at) => nonEmpty([at(1), wrapped('(', at(5), ')'), prefixed('@ ', at(4))]).join(' '),
  XTN: (at) => nonEmpty([at(4) || at(1) || nonEmpty([at(5), at(6), at(7)]).join(' '), wrapped('(', at(2), ')')]).join(' '),
  CE: codedText,
  CWE: codedText,
  CNE: codedText,
  PL: (at) => nonEmpty([at(1), at(2), at(3), at(4)]).join(' / '),
  EI: (at) => nonEmpty([at(1), prefixed('@ ', at(2))]).join(' '),
  HD: (at) => nonEmpty([at(1), at(2)]).join(' '),
};

/** One readable line for a single repetition; `c` holds its component values (position 1 = c[0]). */
function summarizeRep(dt, c) {
  const summarize = Object.hasOwn(REP_SUMMARIES, dt) ? REP_SUMMARIES[dt] : null;
  if (!summarize) return nonEmpty(c).join(' ^ ');
  return summarize((n) => c[n - 1] || '');
}

function explainSegment(msg, seg) {
  const def = dict.getSegment(seg.name);
  const out = {
    index: seg.index,
    name: seg.name,
    description: def ? def.name : 'Unknown segment',
    known: !!def,
    start: seg.start,
    end: seg.end,
    fields: [],
  };

  for (let seq = 1; seq < seg.fields.length; seq++) {
    const field = seg.fields[seq];
    if (!field || field.raw.trim() === '') continue;
    const fdef = def?.byNo[seq];

    // OBX-5 takes its data type from OBX-2
    let dt = fdef ? fdef.dt : '';
    if (seg.name === 'OBX' && seq === 5) dt = seg.fields[2] ? seg.fields[2].raw.trim() : '';
    const names = dict.componentNames(dt);

    const reps = field.reps.filter((r) => r.raw.trim() !== '').map((rep) => {
      const all = rep.comps.map((comp, i) => {
        const n = i + 1;
        const value = unescape(comp.raw, msg.delims).trimEnd();
        const table = fdef?.tables[n] ?? null;
        const fallbackName = rep.comps.length > 1 ? `Component ${n}` : '';
        return {
          n,
          name: names?.[i] || fallbackName,
          value,
          decoded: table && value !== '' ? tables.lookup(table, value) : null,
          table,
          start: comp.start,
          end: comp.end,
        };
      });
      let display = summarizeRep(dt, all.map((c) => c.value));
      // Show the meaning next to a coded value: "M (Male)"
      const coded = all.find((c) => c.decoded && c.n === 1);
      if (coded && !['TS', 'DTM', 'DT'].includes(dt)) {
        display = all.length === 1 ? `${coded.value} (${coded.decoded})` : `${display} (${coded.decoded})`;
      }
      return { start: rep.start, end: rep.end, display, components: all.filter((c) => c.value !== '') };
    });

    out.fields.push({
      seq,
      path: `${seg.name}-${seq}`,
      name: fdef ? fdef.name : `Field ${seq}`,
      known: !!fdef,
      dt,
      dtName: dict.DATA_TYPE_NAMES[dt] || '',
      start: field.start,
      end: field.end,
      display: reps.map((r) => r.display).join('  |  '),
      reps,
    });
  }
  return out;
}

const EVENT_PHRASES = {
  A01: 'was admitted',
  A02: 'was transferred',
  A03: 'was discharged',
  A04: 'was registered',
  A05: 'was pre-admitted',
  A08: 'had their information updated',
  A11: 'had the admission cancelled',
  A13: 'had the discharge cancelled',
  A18: 'had another patient record merged into theirs',
  A40: 'had another patient identifier merged into theirs',
  A60: 'had their allergy information updated',
};

/** Helpers that read values out of one parsed message. */
function makeReader(msg) {
  const v = (path) => get(msg, path, { unescaped: true }).trim();
  const comps = (seg, n) =>
    (seg?.fields[n]?.reps[0]?.comps ?? []).map((c) => unescape(c.raw, msg.delims).trimEnd());
  const withMeaning = (value, table) => {
    if (!value) return '';
    const meaning = tables.lookup(table, value);
    return meaning ? `${value} (${meaning})` : value;
  };
  const joinAt = (a, b) => nonEmpty([v(a), v(b)]).join(' @ ');
  const code = v('MSH-9.1');
  const event = v('MSH-9.2');
  return {
    msg,
    v,
    comps,
    withMeaning,
    joinAt,
    code,
    event,
    type: dict.messageTypeLabel(code, event),
    typeName: dict.messageName(code, event),
    service: (obr) => summarizeRep('CE', comps(obr, 4)),
    obrs: msg.segments.filter((s) => s.name === 'OBR'),
    obxs: msg.segments.filter((s) => s.name === 'OBX'),
  };
}

function headerFacts(r, fact) {
  const { v } = r;
  fact('Message type', r.typeName ? `${r.type} - ${r.typeName}` : r.type);
  fact('Structure', v('MSH-9.3'));
  fact('HL7 version', v('MSH-12.1'));
  fact('Control ID', v('MSH-10'));
  fact('Sent', prettyDtm(v('MSH-7.1')));
  fact('From', r.joinAt('MSH-3.1', 'MSH-4.1'));
  fact('To', r.joinAt('MSH-5.1', 'MSH-6.1'));
  fact('Processing', r.withMeaning(v('MSH-11.1'), '0103'));
}

/** Adds the patient facts; returns the name and ID for the narrative. */
function patientFacts(r, fact) {
  const pid = r.msg.segments.find((s) => s.name === 'PID');
  if (!pid) return { patientName: '', patientId: '' };
  const patientName = summarizeRep('XPN', r.comps(pid, 5));
  const patientId = summarizeRep('CX', r.comps(pid, 3));
  fact('Patient', patientName);
  fact('Patient ID', patientId);
  fact('Born', prettyDtm(r.v('PID-7.1')));
  fact('Sex', r.withMeaning(r.v('PID-8'), '0001'));
  fact('Address', summarizeRep('XAD', r.comps(pid, 11)));
  return { patientName, patientId };
}

/** Adds the visit facts; returns the patient class for the narrative. */
function visitFacts(r, fact) {
  const pv1 = r.msg.segments.find((s) => s.name === 'PV1');
  if (!pv1) return '';
  const patientClass = r.withMeaning(r.v('PV1-2'), '0004');
  fact('Patient class', patientClass);
  fact('Location', summarizeRep('PL', r.comps(pv1, 3)));
  if (r.code === 'ADT' && r.event === 'A02') fact('Moved from', summarizeRep('PL', r.comps(pv1, 6)));
  fact('Attending doctor', summarizeRep('XCN', r.comps(pv1, 7)));
  fact('Visit number', summarizeRep('CX', r.comps(pv1, 19)));
  fact('Admitted', prettyDtm(r.v('PV1-44.1')));
  fact('Discharged', prettyDtm(r.v('PV1-45.1')));
  return patientClass;
}

function mergeAndAllergyFacts(r, fact) {
  const mrg = r.msg.segments.find((s) => s.name === 'MRG');
  if (mrg) {
    fact('Merged away (ID)', summarizeRep('CX', r.comps(mrg, 1)));
    fact('Merged away (name)', summarizeRep('XPN', r.comps(mrg, 7)));
  }
  r.msg.segments.filter((s) => s.name === 'IAM').forEach((iam, i, all) => {
    const prefix = all.length > 1 ? `Allergy ${i + 1}` : 'Allergy';
    const label = (n) => r.comps(iam, n)[1] || r.comps(iam, n)[0] || '';
    const severity = label(4);
    const allergen = label(3);
    fact(prefix, severity ? `${allergen} (${severity})` : allergen);
  });
}

function ackFacts(r, fact) {
  if (!r.msg.segments.some((s) => s.name === 'MSA')) return;
  fact('Acknowledgment', r.withMeaning(r.v('MSA-1'), '0008'));
  fact('Answers message', r.v('MSA-2'));
  fact('Text', r.v('MSA-3'));
  if (!r.msg.segments.some((s) => s.name === 'ERR')) return;
  fact('Error', r.withMeaning(r.v('ERR-3.1'), '0357'));
  fact('Error text', r.v('ERR-7'));
}

function orderFacts(r, fact) {
  const { obrs, obxs } = r;
  const orc = r.msg.segments.find((s) => s.name === 'ORC');
  if (orc) {
    fact('Order control', r.withMeaning(r.v('ORC-1'), '0119'));
    fact('Placer order number', summarizeRep('EI', r.comps(orc, 2)));
    fact('Filler order number', summarizeRep('EI', r.comps(orc, 3)));
    fact('Ordering provider', summarizeRep('XCN', r.comps(orc, 12)));
  }
  obrs.forEach((obr, i) => fact(obrs.length > 1 ? `Order ${i + 1}` : 'Order', r.service(obr)));
  if (!obxs.length) return;
  const abnormal = obxs.filter((o) => {
    const flag = o.fields[8] ? o.fields[8].raw.trim() : '';
    return flag !== '' && flag !== 'N';
  }).length;
  const noun = obxs.length === 1 ? 'observation' : 'observations';
  const flagged = abnormal ? `, ${abnormal} flagged abnormal` : '';
  fact('Results', `${obxs.length} ${noun}${flagged}`);
}

function openingSentence(r) {
  const from = r.joinAt('MSH-3.1', 'MSH-4.1');
  const to = r.joinAt('MSH-5.1', 'MSH-6.1');
  const sent = prettyDtm(r.v('MSH-7.1'));
  return [
    r.type || 'This message',
    r.typeName ? ` (${r.typeName})` : '',
    from ? ` from ${from}` : '',
    to ? ` to ${to}` : '',
    sent ? `, sent ${sent}` : '',
    '.',
  ].join('');
}

function adtSentence(r, ctx) {
  const { who, patientClass } = ctx;
  const classText = patientClass ? ` (patient class: ${tables.lookup('0004', r.v('PV1-2')) || r.v('PV1-2')})` : '';
  return `Reports that ${who} ${EVENT_PHRASES[r.event]}${classText}.`;
}

function oruSentence(r, { who }) {
  const resultNoun = r.obxs.length === 1 ? 'result' : 'results';
  const ordered = r.obrs.length ? `, ordered as ${r.obrs.map(r.service).join('; ')}` : '';
  return `Delivers ${r.obxs.length} observation ${resultNoun} for ${who}${ordered}.`;
}

function ormSentence(r, { who }) {
  const control = r.withMeaning(r.v('ORC-1'), '0119');
  const controlText = control ? ` (${control})` : '';
  const items = r.obrs.length ? `: ${r.obrs.map(r.service).join('; ')}` : '';
  return `Carries an order${controlText} for ${who}${items}.`;
}

function ackSentence(r) {
  const ack = r.withMeaning(r.v('MSA-1'), '0008');
  const note = r.v('MSA-3') ? `: ${r.v('MSA-3')}` : '';
  return `Acknowledges message ${r.v('MSA-2') || '(unknown)'} with ${ack || 'no code'}${note}.`;
}

/** The second sentence, which depends on the kind of message; '' when there is nothing to add. */
function detailSentence(r, ctx) {
  if (r.code === 'ADT' && EVENT_PHRASES[r.event]) return adtSentence(r, ctx);
  if (r.code === 'ORU') return oruSentence(r, ctx);
  if (r.code === 'ORM') return ormSentence(r, ctx);
  if (r.code === 'ACK') return ackSentence(r);
  return ctx.patientName ? `Concerns ${ctx.who}.` : '';
}

/** Explain a message: the main facts, a short narrative and every field with its name and meaning. */
function explain(text) {
  const msg = parseMessage(text);
  if (msg.segments.length === 0) return { empty: true, messageType: '', facts: [], narrative: '', segments: [] };

  const r = makeReader(msg);
  const facts = [];
  const fact = (label, value) => {
    if (value) facts.push({ label, value });
  };

  headerFacts(r, fact);
  const { patientName, patientId } = patientFacts(r, fact);
  const patientClass = visitFacts(r, fact);
  mergeAndAllergyFacts(r, fact);
  ackFacts(r, fact);
  orderFacts(r, fact);

  const patientRef = patientId ? `${patientName} (${patientId})` : patientName;
  const who = patientName ? patientRef : 'the patient';
  const sentences = [openingSentence(r), detailSentence(r, { who, patientName, patientClass })];

  return {
    empty: false,
    messageType: r.type,
    facts,
    narrative: sentences.filter(Boolean).join(' '),
    segments: msg.segments.map((s) => explainSegment(msg, s)),
  };
}

module.exports = { explain, prettyDtm, summarizeRep };
