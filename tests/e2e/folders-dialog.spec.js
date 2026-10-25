const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  HL7_MESSAGES, launchApp, closeApp, waitForWindow, stubDialogs, queueDialog, getDialogCalls,
  makeTempDir, removeTempDir, waitForFile, pasteMessage, clearDirtyState, configureBulkGeneration,
  generateBulk, goTo, tid, takeScreenshotOnFailure,
} = require('./helpers');

// Default folders for real: the folder dialog is answered by a stand-in.

const UNSET = 'Not set - the last used folder is used';

test.describe('Default folders', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  let dir;
  let other;

  test.beforeEach(async () => {
    dir = makeTempDir();
    other = makeTempDir();
    electronApp = await launchApp();
    await stubDialogs(electronApp);
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
    await goTo(window, 'settings');
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    removeTempDir(dir);
    removeTempDir(other);
  });

  const choose = async (kind, folder) => {
    await queueDialog(electronApp, 'open', { paths: [folder] });
    await tid(window, `folder-${kind}-choose`).click();
  };

  const readSettings = () => {
    try {
      return JSON.parse(fs.readFileSync(path.join(electronApp.userDataDir, 'settings.json'), 'utf8'));
    } catch {
      return { folders: {} }; // not written yet
    }
  };

  for (const kind of ['save', 'export']) {
    test.describe(`${kind} folder`, () => {
      test('Choose shows the folder and the dialog asks for a folder', async () => {
        await choose(kind, dir);
        await expect(tid(window, `folder-${kind}`)).toHaveText(dir);
        const [call] = await getDialogCalls(electronApp, 'open');
        expect(call.options.properties).toContain('openDirectory');
        expect(call.options.title).toBe(kind === 'save' ? 'Default folder for saving messages' : 'Default folder for exporting the bulk list');
      });

      test('Choose remembers the folder in the settings file', async () => {
        await choose(kind, dir);
        await expect(tid(window, `folder-${kind}`)).toHaveText(dir);
        await expect.poll(() => readSettings().folders[kind]).toBe(dir);
      });

      test('Clear goes back to "not set"', async () => {
        await choose(kind, dir);
        await expect(tid(window, `folder-${kind}`)).toHaveText(dir);
        await tid(window, `folder-${kind}-clear`).click();
        await expect(tid(window, `folder-${kind}`)).toHaveText(UNSET);
        await expect.poll(() => readSettings().folders[kind]).toBeNull();
      });

      test('a cancelled dialog changes nothing', async () => {
        await tid(window, `folder-${kind}-choose`).click();
        await expect.poll(async () => (await getDialogCalls(electronApp, 'open')).length).toBe(1);
        await expect(tid(window, `folder-${kind}`)).toHaveText(UNSET);
      });
    });
  }

  test('the two folders are independent', async () => {
    await choose('save', dir);
    await expect(tid(window, 'folder-save')).toHaveText(dir);
    await choose('export', other);
    await expect(tid(window, 'folder-export')).toHaveText(other);
    await expect(tid(window, 'folder-save')).toHaveText(dir);
  });

  test('the Save dialog starts in the default save folder', async () => {
    await choose('save', dir);
    await expect(tid(window, 'folder-save')).toHaveText(dir);
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await tid(window, 'file-save').click();
    await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(1);
    const [call] = await getDialogCalls(electronApp, 'save');
    expect(path.dirname(call.options.defaultPath)).toBe(dir);
  });

  test('the Export dialog starts in the default export folder', async () => {
    await choose('export', dir);
    await expect(tid(window, 'folder-export')).toHaveText(dir);
    await configureBulkGeneration(window, { count: 2 });
    await generateBulk(window);
    await tid(window, 'export-run').click();
    await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(1);
    const [call] = await getDialogCalls(electronApp, 'save');
    expect(path.dirname(call.options.defaultPath)).toBe(dir);
  });

  test('without a default, the Save dialog starts in the folder used last', async () => {
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await queueDialog(electronApp, 'save', { path: path.join(other, 'first.hl7') });
    await tid(window, 'file-save-as').click();
    await waitForFile(path.join(other, 'first.hl7'));
    await tid(window, 'file-save-as').click();
    await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(2);
    const calls = await getDialogCalls(electronApp, 'save');
    expect(path.dirname(calls[1].options.defaultPath)).toBe(other);
  });

  test('a default folder that no longer exists is replaced by the folder used last', async () => {
    const gone = path.join(dir, 'gone');
    fs.mkdirSync(gone);
    await choose('save', gone);
    await expect(tid(window, 'folder-save')).toHaveText(gone);
    fs.rmdirSync(gone);
    await pasteMessage(window, HL7_MESSAGES.ADT_A01);
    await tid(window, 'file-save').click();
    await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(1);
    const [call] = await getDialogCalls(electronApp, 'save');
    expect(path.dirname(call.options.defaultPath)).not.toBe(gone);
  });

  test('a chosen default folder is still there after a restart', async () => {
    await choose('save', dir);
    await expect(tid(window, 'folder-save')).toHaveText(dir);
    await expect.poll(() => readSettings().folders.save).toBe(dir);
    await closeApp(electronApp, { keepData: true });
    electronApp = await launchApp({ userDataDir: electronApp.userDataDir });
    window = await waitForWindow(electronApp);
    await goTo(window, 'settings');
    await expect(tid(window, 'folder-save')).toHaveText(dir);
  });
});
