'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const tags = [...html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*>/g)].map((m) => ({ name: m[1], text: m[0] }));
const testIds = tags.map((t) => /data-testid="([^"]+)"/.exec(t.text)?.[1]).filter(Boolean);

test('every test id in index.html is unique', () => {
  const seen = new Set();
  for (const id of testIds) {
    assert.ok(!seen.has(id), `duplicate test id ${id}`);
    seen.add(id);
  }
});

test('every control, heading, label and output has a test id', () => {
  const needed = new Set(['button', 'input', 'select', 'textarea', 'a', 'summary', 'details', 'label', 'legend',
    'fieldset', 'output', 'form', 'dialog', 'h1', 'h2', 'th', 'dt', 'dd', 'nav', 'main']);
  const missing = tags.filter((t) => needed.has(t.name) && !t.text.includes('data-testid')).map((t) => t.text);
  assert.deepEqual(missing, []);
});

test('an element with an id uses it as its test id', () => {
  for (const t of tags) {
    const id = /\sid="([^"]+)"/.exec(t.text)?.[1];
    if (id) assert.ok(t.text.includes(`data-testid="${id}"`), `${id} has no matching test id`);
  }
});
