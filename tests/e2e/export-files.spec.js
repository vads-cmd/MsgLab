const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  launchApp, closeApp, waitForWindow, stubDialogs, queueDialog, getDialogCalls, sendMenuCommand,
  makeTempDir, removeTempDir, waitForFile, clearDirtyState, configureBulkGeneration, generateBulk,
  setExportMode, setExportBatch, setFileOptions, selectNoBulkTypes, goTo, tid,
  takeScreenshotOnFailure,
} = require('./helpers');

// Exporting the bulk list for real: the save and folder dialogs are answered by stand-ins.

const lines = (bytes) => bytes.toString('utf8').split(/\r\n|\r|\n/).filter(Boolean);
const startingWith = (all, prefix) => all.filter((line) => line.startsWith(prefix));

test.describe('Exporting the bulk list', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;
  let dir;

  test.beforeEach(async () => {
    dir = makeTempDir();
    electronApp = await launchApp();
    await stubDialogs(electronApp);
    window = await waitForWindow(electronApp);
    await clearDirtyState(window);
  });

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await takeScreenshotOnFailure(window, testInfo);
    }
    await closeApp(electronApp);
    removeTempDir(dir);
  });

  const generate = async (count = 3) => {
    await configureBulkGeneration(window, { count });
    await generateBulk(window);
    await expect(tid(window, 'bulk-result')).toBeVisible();
  };

  const exportTo = async (target, mode = 'one') => {
    await setExportMode(window, mode);
    if (mode === 'one') await queueDialog(electronApp, 'save', { path: target });
    else await queueDialog(electronApp, 'open', { paths: [target] });
    await tid(window, 'export-run').click();
  };

  test.describe('One file', () => {
    test('writes all messages between a batch header and trailer', async () => {
      await generate(3);
      await exportTo(path.join(dir, 'all.hl7'));
      const all = lines(await waitForFile(path.join(dir, 'all.hl7')));
      expect(all[0]).toMatch(/^FHS\|/);
      expect(all[1]).toMatch(/^BHS\|/);
      expect(startingWith(all, 'MSH|')).toHaveLength(3);
      expect(all.at(-2)).toBe('BTS|3');
      expect(all.at(-1)).toBe('FTS|1');
      await expect(tid(window, 'export-status')).toHaveText('Exported 3 messages to 1 file in all.hl7');
    });

    test('suggests a name with the number of messages', async () => {
      await generate(3);
      await exportTo(path.join(dir, 'name.hl7'));
      await waitForFile(path.join(dir, 'name.hl7'));
      const [call] = await getDialogCalls(electronApp, 'save');
      expect(path.basename(call.options.defaultPath)).toMatch(/^messages_3_.+\.hl7$/);
    });

    test('has no batch header when the box is unticked', async () => {
      await generate(3);
      await setExportBatch(window, false);
      await exportTo(path.join(dir, 'plain.hl7'));
      const all = lines(await waitForFile(path.join(dir, 'plain.hl7')));
      expect(all[0]).toMatch(/^MSH\|/);
      expect(startingWith(all, 'FHS|')).toHaveLength(0);
      expect(startingWith(all, 'MSH|')).toHaveLength(3);
    });

    test('follows the line ending chosen in Settings', async () => {
      await setFileOptions(window, { eol: 'crlf', encoding: 'utf-8', mllp: false });
      await generate(2);
      await setExportBatch(window, false);
      await exportTo(path.join(dir, 'crlf.hl7'));
      const text = (await waitForFile(path.join(dir, 'crlf.hl7'))).toString('utf8');
      expect(text).toContain('\r\n');
      expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
    });

    test('frames every message in MLLP and switches the batch header off', async () => {
      await setFileOptions(window, { eol: 'cr', encoding: 'utf-8', mllp: true });
      await generate(3);
      await expect(tid(window, 'export-batch')).toBeDisabled();
      await exportTo(path.join(dir, 'mllp.hl7'));
      const bytes = await waitForFile(path.join(dir, 'mllp.hl7'));
      expect(bytes.filter((byte) => byte === 0x0b)).toHaveLength(3);
      expect(bytes.filter((byte) => byte === 0x1c)).toHaveLength(3);
      expect(bytes.toString('utf8')).not.toContain('FHS|');
    });

    test('changes nothing when the dialog is cancelled', async () => {
      await generate(3);
      await tid(window, 'export-run').click();
      await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(1);
      await expect(tid(window, 'export-status')).toHaveText('');
      await expect(tid(window, 'export-run')).toBeEnabled();
      expect(fs.readdirSync(dir)).toEqual([]);
    });
  });

  test.describe('One file per message', () => {
    test('writes numbered files named after the type and control ID, without a batch header', async () => {
      await generate(3);
      await setExportMode(window, 'each');
      await expect(tid(window, 'export-batch')).toBeDisabled();
      await exportTo(dir, 'each');
      await expect(tid(window, 'export-status')).toHaveText(`Exported 3 messages to 3 files in ${path.basename(dir)}`);
      const names = fs.readdirSync(dir).sort();
      expect(names).toHaveLength(3);
      expect(names[0]).toMatch(/^1_ADT_A01_.+\.hl7$/);
      expect(names[2]).toMatch(/^3_ADT_A01_.+\.hl7$/);
      for (const name of names) {
        const all = lines(fs.readFileSync(path.join(dir, name)));
        expect(startingWith(all, 'MSH|')).toHaveLength(1);
        expect(startingWith(all, 'FHS|')).toHaveLength(0);
      }
    });

    test('asks before replacing files that exist, and Cancel leaves them alone', async () => {
      await generate(2);
      await exportTo(dir, 'each');
      await expect(tid(window, 'export-status')).toContainText('Exported 2 messages');
      const before = fs.readdirSync(dir).sort();
      fs.writeFileSync(path.join(dir, before[0]), 'changed');
      expect(await getDialogCalls(electronApp, 'box')).toHaveLength(0);

      await queueDialog(electronApp, 'open', { paths: [dir] }); // the question has no answer queued: Cancel
      await tid(window, 'export-run').click();
      await expect.poll(async () => (await getDialogCalls(electronApp, 'box')).length).toBe(1);
      expect(fs.readFileSync(path.join(dir, before[0]), 'utf8')).toBe('changed');
      await expect(tid(window, 'export-status')).toHaveText('');

      await queueDialog(electronApp, 'open', { paths: [dir] });
      await queueDialog(electronApp, 'box', 0); // Replace
      await tid(window, 'export-run').click();
      await expect(tid(window, 'export-status')).toContainText('Exported 2 messages');
      expect(fs.readFileSync(path.join(dir, before[0]), 'utf8')).toContain('MSH|');
    });
  });

  test.describe('One file per message type', () => {
    const tickTypes = async (types) => {
      await selectNoBulkTypes(window);
      for (const type of types) await tid(window, `bulk-type-${type}`).check();
    };

    test('writes one file for each type', async () => {
      await goTo(window, 'bulk');
      await tickTypes(['ADT-A01', 'ORU-R01']);
      await configureBulkGeneration(window, { count: 4 });
      await generateBulk(window);
      await exportTo(dir, 'type');
      await expect(tid(window, 'export-status')).toHaveText(`Exported 4 messages to 2 files in ${path.basename(dir)}`);
      expect(fs.readdirSync(dir).sort()).toEqual(['ADT_A01.hl7', 'ORU_R01.hl7']);
      const adt = lines(fs.readFileSync(path.join(dir, 'ADT_A01.hl7')));
      expect(adt[0]).toMatch(/^FHS\|/); // one batch per file
      expect(startingWith(adt, 'MSH|')).toHaveLength(2);
      expect(adt.at(-2)).toBe('BTS|2');
    });

    test('asks before replacing a file that exists', async () => {
      await generate(2);
      fs.writeFileSync(path.join(dir, 'ADT_A01.hl7'), 'old');
      await exportTo(dir, 'type'); // no answer queued for the question: Cancel
      await expect.poll(async () => (await getDialogCalls(electronApp, 'box')).length).toBe(1);
      const [box] = await getDialogCalls(electronApp, 'box');
      expect(box.options.title).toBe('Files already exist');
      expect(box.options.buttons).toEqual(['Replace', 'Cancel']);
      expect(fs.readFileSync(path.join(dir, 'ADT_A01.hl7'), 'utf8')).toBe('old');
      await expect(tid(window, 'export-status')).toHaveText('');

      await queueDialog(electronApp, 'box', 0);
      await queueDialog(electronApp, 'open', { paths: [dir] });
      await tid(window, 'export-run').click();
      await expect(tid(window, 'export-status')).toContainText('Exported 2 messages');
      expect(fs.readFileSync(path.join(dir, 'ADT_A01.hl7'), 'utf8')).toContain('MSH|');
    });
  });

  test.describe('From the File menu', () => {
    test('exports the list and shows the Bulk view', async () => {
      await generate(2);
      await goTo(window, 'editor');
      await queueDialog(electronApp, 'save', { path: path.join(dir, 'menu.hl7') });
      await sendMenuCommand(electronApp, 'export');
      await waitForFile(path.join(dir, 'menu.hl7'));
      await expect(tid(window, 'view-bulk')).toBeVisible();
      await expect(tid(window, 'export-status')).toContainText('Exported 2 messages');
    });

    test('says so when there is no list yet', async () => {
      await sendMenuCommand(electronApp, 'export');
      await expect(tid(window, 'view-bulk')).toBeVisible();
      await expect(tid(window, 'export-status')).toContainText('There is no list to export');
    });
  });
});
