const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  launchApp, closeApp, waitForWindow, clearDirtyState, makeTempDir, removeTempDir, goTo, tid,
  takeScreenshotOnFailure,
} = require('./helpers');

// What the app remembers between runs: every test starts the app on its own data folder and starts it again on the same one.

test.describe('Remembered settings', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  let dataDir;

  const settingsFile = () => path.join(dataDir, 'settings.json');
  const readSettings = () => {
    try {
      return JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    } catch {
      return { controls: {}, favorites: [], folders: {} }; // not written yet
    }
  };

  const start = async () => {
    electronApp = await launchApp({ userDataDir: dataDir });
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
  };
  const restart = async () => {
    await closeApp(electronApp, { keepData: true });
    await start();
  };

  test.beforeEach(async () => {
    dataDir = makeTempDir();
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    removeTempDir(dataDir);
  });

  test('form choices are remembered after a restart', async () => {
    await start();
    await goTo(window, 'generate');
    await tid(window, 'gen-version').selectOption('2.3');
    await tid(window, 'gen-processing').selectOption('P');
    await tid(window, 'gen-send-app').fill('MYAPP');
    await tid(window, 'gen-recv-fac').fill('MYFAC');
    await tid(window, 'gen-all-empty').check();
    await goTo(window, 'bulk');
    await tid(window, 'bulk-count').fill('7');
    await tid(window, 'bulk-minutes').fill('9');
    await tid(window, 'bulk-mode').selectOption('journey');
    await goTo(window, 'settings');
    await tid(window, 'file-eol').selectOption('lf');
    await tid(window, 'file-encoding').selectOption('windows-1252');
    await tid(window, 'file-mllp').check();
    await expect.poll(() => readSettings().controls['file-mllp']).toBe(true);

    await restart();
    await goTo(window, 'generate');
    await expect(tid(window, 'gen-version')).toHaveValue('2.3');
    await expect(tid(window, 'gen-processing')).toHaveValue('P');
    await expect(tid(window, 'gen-send-app')).toHaveValue('MYAPP');
    await expect(tid(window, 'gen-recv-fac')).toHaveValue('MYFAC');
    await expect(tid(window, 'gen-all-empty')).toBeChecked();
    await goTo(window, 'bulk');
    await expect(tid(window, 'bulk-count')).toHaveValue('7');
    await expect(tid(window, 'bulk-minutes')).toHaveValue('9');
    await expect(tid(window, 'bulk-mode')).toHaveValue('journey');
    await goTo(window, 'settings');
    await expect(tid(window, 'file-eol')).toHaveValue('lf');
    await expect(tid(window, 'file-encoding')).toHaveValue('windows-1252');
    await expect(tid(window, 'file-mllp')).toBeChecked();
  });

  test('the seed and manual values are not remembered', async () => {
    await start();
    await goTo(window, 'generate');
    await tid(window, 'gen-seed').fill('my-seed');
    await tid(window, 'manual-familyName-value').fill('Smithers');
    await tid(window, 'gen-send-app').fill('KEEPAPP'); // something that is remembered, to know the file was written
    await expect.poll(() => readSettings().controls['gen-send-app']).toBe('KEEPAPP');
    expect(Object.keys(readSettings().controls).some((id) => id === 'gen-seed' || id.startsWith('m-'))).toBe(false);

    await restart();
    await goTo(window, 'generate');
    await expect(tid(window, 'gen-seed')).toHaveValue('');
    await expect(tid(window, 'manual-familyName-value')).toHaveValue('');
  });

  test('a favourite message type is remembered after a restart', async () => {
    await start();
    await goTo(window, 'generate');
    await tid(window, 'gen-type').selectOption('ORU^R01');
    await tid(window, 'gen-fav').click();
    await expect(tid(window, 'gen-fav')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => readSettings().favorites).toEqual(['ORU^R01']);
    await expect.poll(() => readSettings().controls['gen-type']).toBe('ORU^R01');

    await restart();
    await goTo(window, 'generate');
    await expect(tid(window, 'gen-type')).toHaveValue('ORU^R01'); // the type is remembered too
    await expect(tid(window, 'gen-fav')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a damaged settings file is ignored and the defaults are used', async () => {
    fs.writeFileSync(settingsFile(), '{ this is not json');
    await start();
    await goTo(window, 'generate');
    await expect(tid(window, 'gen-version')).toHaveValue('2.5.1');
    await expect(tid(window, 'gen-send-fac')).toHaveValue('SENDHOSP');
    await goTo(window, 'settings');
    await expect(tid(window, 'app-theme')).toHaveValue('system');
  });

  test('unknown or invalid entries in the settings file are ignored', async () => {
    fs.writeFileSync(settingsFile(), JSON.stringify({
      controls: { 'gen-version': '9.9', 'gen-seed': 'abc', 'gen-send-app': 'FROMFILE', 'not-a-control': 'x' },
      favorites: ['ORU^R01', '<script>', 7],
      folders: { save: 12, export: null },
    }));
    await start();
    await goTo(window, 'generate');
    await expect(tid(window, 'gen-version')).toHaveValue('2.5.1'); // 9.9 is not an option
    await expect(tid(window, 'gen-seed')).toHaveValue(''); // the seed is never restored
    await expect(tid(window, 'gen-send-app')).toHaveValue('FROMFILE'); // a valid entry still works
    await goTo(window, 'settings');
    await expect(tid(window, 'folder-save')).toHaveText('Not set - the last used folder is used');
  });
});
