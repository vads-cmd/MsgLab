'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { ABOUT } = require('../src/about');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('the About text', () => {
  assert.strictEqual(ABOUT.name, 'MsgLab');
  assert.strictEqual(ABOUT.owner, 'Vadym "Ailur" Shevchenko');
  assert.strictEqual(ABOUT.repository, 'https://github.com/vads-cmd/MsgLab');
  assert.ok(Object.isFrozen(ABOUT));
});

test('package.json agrees with the About text and has a plain version number', () => {
  assert.strictEqual(pkg.productName, ABOUT.name);
  assert.strictEqual(pkg.license, 'MIT');
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.ok(pkg.repository.url.includes('vads-cmd/MsgLab'));
  assert.strictEqual(pkg.homepage, ABOUT.repository);
});

test('the version only goes up from 0.1.6', () => {
  const [major, minor, patch] = pkg.version.split('.').map(Number);
  assert.ok(major > 0 || minor > 1 || (minor === 1 && patch >= 6), pkg.version);
});

test('the license file names the owner and the year', () => {
  const text = fs.readFileSync(path.join(root, 'LICENSE'), 'utf8');
  assert.match(text, /^MIT License/);
  assert.ok(text.includes('Vadym "Ailur" Shevchenko'));
  assert.match(text, /Copyright \(c\) 20\d\d/);
});

test('the lock file has the same name and version', () => {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assert.strictEqual(lock.name, pkg.name);
  assert.strictEqual(lock.version, pkg.version);
  assert.strictEqual(lock.packages[''].version, pkg.version);
});
