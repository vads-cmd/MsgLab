'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = pkg.build;

test('the build section names the app and its output folder', () => {
  assert.equal(build.productName, pkg.productName);
  assert.match(build.appId, /^[a-z][\w-]*(\.[a-z][\w-]*)+$/i);
  assert.equal(build.directories.output, 'dist');
});

test('the packaged files are listed, and every listed file or folder exists', () => {
  const entries = build.files.map((pattern) => pattern.replace(/\/\*\*\/\*$/, ''));
  for (const entry of entries) assert.ok(fs.existsSync(path.join(root, entry)), `${entry} is listed but missing`);
  for (const needed of ['main.js', 'preload.js', 'index.html', 'renderer.js', 'styles.css', 'src/**/*', 'assets/**/*']) {
    assert.ok(build.files.includes(needed), `${needed} must be packaged`);
  }
});

test('tests and tools are not packaged', () => {
  const listed = build.files.join(' ');
  for (const unwanted of ['test', 'tests', 'scripts', 'allure', 'playwright']) assert.ok(!listed.includes(unwanted), `${unwanted} must not be packaged`);
});

test('the app starts from a packaged file', () => {
  assert.ok(build.files.includes(pkg.main));
});

test('the icon is a square PNG of at least 512 pixels (macOS and Windows icons are made from it)', () => {
  const file = path.join(root, build.icon);
  const data = fs.readFileSync(file);
  assert.equal(data.subarray(1, 4).toString('latin1'), 'PNG');
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  assert.equal(width, height);
  assert.ok(width >= 512, `icon is only ${width} pixels wide`);
});

test('there is a script for each platform and for an unpacked test build', () => {
  for (const name of ['pack', 'dist', 'dist:mac', 'dist:win', 'dist:linux']) assert.ok(pkg.scripts[name], `missing script ${name}`);
});

test('installers are not signed by accident: macOS signing is off until there is a certificate', () => {
  assert.equal(build.mac.identity, "-");
  assert.equal(build.mac.hardenedRuntime, false);
  assert.equal(build.afterSign, "scripts/adhoc-sign.js");
  assert.equal(typeof require(path.join(root, build.afterSign)), "function");
});

test('linux builds AppImage, deb and rpm and name a maintainer', () => {
  assert.deepEqual(build.linux.target, ['AppImage', 'deb', 'rpm']);
  assert.match(build.linux.maintainer, /^.+ <[^<>@\s]+@[^<>@\s]+>$/);
});

test('linux windows are linked to the desktop entry', () => {
  assert.equal(pkg.desktopName, 'msglab.desktop');
  assert.equal(build.linux.syncDesktopName, true);
});
