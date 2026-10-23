'use strict';

const input = document.getElementById('message');
const tabs = Array.from(document.querySelectorAll('.tab'));
const panels = {
  validation: document.getElementById('panel-validation'),
  explain: document.getElementById('panel-explain'),
};
const PLACEHOLDERS = {
  validation: 'Validation results will appear here.',
  explain: 'The explanation will appear here.',
};

let timer = null;
let latestRequest = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/* ---- tabs ---- */

function selectTab(name) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    panels[tab.dataset.tab].hidden = !active;
  }
}

function setValidationLabel(problems) {
  document.getElementById('tab-validation').textContent = problems ? `Validation (${problems})` : 'Validation';
}

function showPlaceholders() {
  for (const name of Object.keys(panels)) {
    panels[name].replaceChildren(el('p', 'placeholder', PLACEHOLDERS[name]));
  }
  setValidationLabel(0);
}

/* ---- validation tab ---- */

function renderValidation(result) {
  const children = [];

  const summary = el('div', 'summary');
  summary.append(el('span', `badge ${result.valid ? 'ok' : 'bad'}`, result.valid ? 'Valid' : 'Not valid'));
  const parts = [plural(result.counts.error, 'error'), plural(result.counts.warning, 'warning')];
  if (result.counts.info) parts.push(plural(result.counts.info, 'note'));
  if (result.messageType) parts.unshift(result.messageType);
  summary.append(el('span', 'summary-text', parts.join(' · ')));
  children.push(summary);

  if (result.issues.length === 0) {
    children.push(el('p', 'placeholder', 'No problems found.'));
  } else {
    const list = el('ul', 'issues');
    for (const issue of result.issues) {
      const item = el('li', `issue ${issue.severity}`);
      item.append(el('span', 'severity', issue.severity));
      const body = el('div', 'issue-body');
      body.append(el('div', 'issue-message', issue.message));
      body.append(el('div', 'issue-where', [issue.path, `line ${issue.line}`].filter(Boolean).join(' · ')));
      item.append(body);
      list.append(item);
    }
    children.push(list);
  }

  panels.validation.replaceChildren(...children);
  setValidationLabel(result.counts.error + result.counts.warning);
}

/* ---- explain tab ---- */

function renderSegment(seg) {
  const details = el('details', 'segment');
  details.open = true;
  const summary = el('summary');
  summary.append(el('span', 'seg-name', seg.name), el('span', 'seg-desc', seg.description));
  details.append(summary);

  if (seg.fields.length === 0) {
    details.append(el('p', 'placeholder', seg.known ? 'No values in this segment.' : 'This segment is not in the built-in dictionary.'));
    return details;
  }

  const table = el('table', 'fields');
  for (const field of seg.fields) {
    const row = el('tr');
    row.append(el('td', 'f-path', field.path), el('td', 'f-name', field.name));

    const value = el('td', 'f-value');
    value.append(el('div', 'f-display', field.display));
    if (field.reps.some((rep) => rep.components.length > 1)) {
      const comps = el('div', 'f-comps');
      for (const rep of field.reps) {
        for (const c of rep.components) {
          const chip = el('span', 'chip');
          chip.append(el('span', 'chip-name', c.name || `#${c.n}`));
          chip.append(document.createTextNode(c.decoded ? ` ${c.value} (${c.decoded})` : ` ${c.value}`));
          comps.append(chip);
        }
      }
      value.append(comps);
    }
    row.append(value, el('td', 'f-type', field.dt));
    table.append(row);
  }
  details.append(table);
  return details;
}

function renderExplain(result) {
  if (result.empty) {
    panels.explain.replaceChildren(el('p', 'placeholder', PLACEHOLDERS.explain));
    return;
  }
  const children = [];
  if (result.narrative) children.push(el('p', 'narrative', result.narrative));
  if (result.facts.length) {
    const list = el('dl', 'facts');
    for (const fact of result.facts) list.append(el('dt', '', fact.label), el('dd', '', fact.value));
    children.push(list);
  }
  for (const seg of result.segments) children.push(renderSegment(seg));
  panels.explain.replaceChildren(...children);
}

/* ---- wiring ---- */

async function run() {
  const text = input.value;
  if (text.trim() === '') {
    latestRequest++;
    showPlaceholders();
    return;
  }
  const request = ++latestRequest;
  try {
    const [validation, explanation] = await Promise.all([window.hl7.validate(text), window.hl7.explain(text)]);
    if (request !== latestRequest) return; // ignore answers that arrive late
    renderValidation(validation);
    renderExplain(explanation);
  } catch (err) {
    if (request !== latestRequest) return;
    for (const name of Object.keys(panels)) {
      panels[name].replaceChildren(el('p', 'placeholder', `Something went wrong: ${err.message}`));
    }
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(run, 250);
});

showPlaceholders();
selectTab('validation');

/* ---- generator ---- */

const generatorForm = document.getElementById('generator');
const genStatus = document.getElementById('gen-status');
const fieldValue = (id) => document.getElementById(id).value;

async function generateMessage() {
  genStatus.classList.remove('error');
  genStatus.textContent = '';
  try {
    const result = await window.hl7.generate({
      type: fieldValue('gen-type'),
      version: fieldValue('gen-version'),
      sendingApp: fieldValue('gen-send-app'),
      sendingFacility: fieldValue('gen-send-fac'),
      receivingApp: fieldValue('gen-recv-app'),
      receivingFacility: fieldValue('gen-recv-fac'),
      processingId: fieldValue('gen-processing'),
      seed: fieldValue('gen-seed'),
      fields: collectManual(),
    });
    if (!result.ok) throw new Error(result.error);
    input.value = result.text;
    input.scrollTop = 0;
    genStatus.textContent = `Generated ${result.type} (v${result.version}) · seed ${result.seed}${result.manual.length ? ` · ${plural(result.manual.length, 'manual value')}` : ''}`;
    clearTimeout(timer);
    run();
  } catch (err) {
    genStatus.classList.add('error');
    genStatus.textContent = err.message;
  }
}

generatorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  generateMessage();
});

/* ---- manual values ---- */

// [key, label, events it applies to (all when left out)]
const MANUAL_GROUPS = [
  ['Patient', [
    ['familyName', 'Last name'], ['givenName', 'First name'], ['middleInitial', 'Middle initial'], ['birthDate', 'Birth date (YYYYMMDD)'],
    ['sex', 'Sex'], ['maritalStatus', 'Marital status (code)'], ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip code'], ['phone', 'Phone'],
  ]],
  ['Identifiers', [
    ['mrn', 'Patient ID (MRN)'], ['accountNumber', 'Account number'], ['visitNumber', 'Visit number'],
  ]],
  ['Visit and location', [
    ['patientClass', 'Patient class'], ['unit', 'Unit'], ['room', 'Room'], ['bed', 'Bed'],
    ['doctorId', 'Doctor ID'], ['doctorFamily', 'Doctor last name'], ['doctorGiven', 'Doctor first name'],
    ['admitTime', 'Admit time (YYYYMMDDHHMMSS)'], ['admissionType', 'Admission type'], ['hospitalService', 'Hospital service'],
  ]],
  ['This message type only', [
    ['priorUnit', 'Previous unit (A02)', ['ADT^A02']], ['priorRoom', 'Previous room (A02)', ['ADT^A02']], ['priorBed', 'Previous bed (A02)', ['ADT^A02']],
    ['dischargeTime', 'Discharge time (A03)', ['ADT^A03']], ['dischargeDisposition', 'Discharge disposition (A03)', ['ADT^A03']],
  ]],
];

// The fields the validator reports as required: PID-3 (patient ID), PID-5 (name) and PV1-2 (patient class).
const MANDATORY = new Set(['mrn', 'familyName', 'givenName', 'patientClass']);

// applicable: the field exists in the selected message type. A field can also be hidden by the
// "Show non-mandatory fields" switch; it is then still used.
const manualCells = []; // { key, events, cell, text, empty, group, required, applicable }

function buildManual() {
  const container = document.getElementById('manual-fields');
  for (const [title, fields] of MANUAL_GROUPS) {
    const group = el('fieldset', 'manual-group');
    group.append(el('legend', '', title));
    const grid = el('div', 'manual-grid');
    for (const [key, label, events] of fields) {
      const cell = el('div', 'manual-cell');
      const text = el('input');
      text.type = 'text';
      text.id = `m-${key}`;
      text.placeholder = 'random';
      text.maxLength = 80;
      text.autocomplete = 'off';
      const caption = el('label', 'manual-label', label);
      caption.htmlFor = text.id;
      const empty = el('input');
      empty.type = 'checkbox';
      empty.id = `m-${key}-empty`;
      const emptyLabel = el('label', 'manual-empty');
      emptyLabel.htmlFor = empty.id;
      emptyLabel.append(empty, document.createTextNode(' empty'));
      const item = { key, events: events || null, cell, text, empty, group, required: MANDATORY.has(key), applicable: true };
      empty.addEventListener('change', () => {
        setEmpty(item, empty.checked);
        syncAllEmpty();
      });
      cell.append(caption, text, emptyLabel);
      grid.append(cell);
      manualCells.push(item);
    }
    group.append(grid);
    container.append(group);
  }
  updateManualVisibility();
}

function updateManualVisibility() {
  const type = fieldValue('gen-type');
  const showOptional = showOptionalSwitch.checked;
  for (const item of manualCells) {
    item.applicable = !item.events || item.events.includes(type);
    item.cell.hidden = !item.applicable || (!showOptional && !item.required);
  }
  for (const group of new Set(manualCells.map((item) => item.group))) {
    group.hidden = manualCells.filter((item) => item.group === group).every((item) => item.cell.hidden);
  }
  syncAllEmpty();
}

/** { key: "text" } for typed values, { key: null } for fields to leave empty; random fields are left out. */
function collectManual() {
  const values = {};
  for (const item of manualCells) {
    if (!item.applicable) continue;
    if (item.empty.checked) values[item.key] = null;
    else if (item.text.value.trim() !== '') values[item.key] = item.text.value;
  }
  return values;
}

function clearManual() {
  for (const item of manualCells) {
    setEmpty(item, false);
    item.text.value = '';
  }
  syncAllEmpty();
}

/** Put one field in or out of the "left empty" state. */
function setEmpty(item, on) {
  item.empty.checked = on;
  item.text.disabled = on;
  if (on) item.text.value = '';
  item.text.placeholder = on ? 'left empty' : 'random';
}

// The switch is on when every visible field is empty, and half-way when only some are.
const allEmptySwitch = document.getElementById('gen-all-empty');
const showOptionalSwitch = document.getElementById('manual-show-optional');
const hiddenNote = document.getElementById('manual-hidden-note');

/** Tell the user when fields that are out of sight still have a value or are set to empty. */
function updateHiddenNote() {
  const count = manualCells.filter((item) => item.applicable && item.cell.hidden && (item.empty.checked || item.text.value.trim() !== '')).length;
  hiddenNote.textContent = count ? `${count} hidden field${count === 1 ? ' still applies' : 's still apply'}` : '';
}

function syncAllEmpty() {
  const shown = manualCells.filter((item) => !item.cell.hidden);
  const emptyCount = shown.filter((item) => item.empty.checked).length;
  allEmptySwitch.checked = shown.length > 0 && emptyCount === shown.length;
  allEmptySwitch.indeterminate = emptyCount > 0 && emptyCount < shown.length;
  updateHiddenNote();
}

// Applies to every field, also those of other message types, so changing the type keeps the choice.
allEmptySwitch.addEventListener('change', () => {
  for (const item of manualCells) setEmpty(item, allEmptySwitch.checked);
  syncAllEmpty();
});

document.getElementById('gen-type').addEventListener('change', updateManualVisibility);
showOptionalSwitch.addEventListener('change', updateManualVisibility);
document.getElementById('manual-clear').addEventListener('click', clearManual);
buildManual();
