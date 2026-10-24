const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const {
  HL7_MESSAGES, launchApp, closeApp, waitForWindow, stubDialogs, queueDialog, getDialogCalls,
  sendMenuCommand, makeTempDir, removeTempDir, waitForFile, waitForFileText, pasteMessage, clearDirtyState,
  setFileOptions, goTo, tid, takeScreenshotOnFailure,
} = require('./helpers');

// The native dialogs are replaced by stand-ins (see stubDialogs), so these tests really save and open files.

const SEGMENTS = HL7_MESSAGES.ADT_A01.split('\r');
const asFile = (lines, eol) => Buffer.from(lines.map((line) => line + eol).join(''), 'utf8');

test.describe('Saving and opening files', () => {
  let electronApp;
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
    // If a test left unsaved changes, let the "close anyway" answer through so the app can quit
    await queueDialog(electronApp, 'box', 0);
    await closeApp(electronApp);
    removeTempDir(dir);
  });

  const saveAs = async (name) => {
    await queueDialog(electronApp, 'save', { path: path.join(dir, name) });
    await tid(window, 'file-save').click();
  };

  test.describe('Save', () => {
    test('writes the message to the chosen file, one segment per line, ending in CR', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('a.hl7');
      const bytes = await waitForFile(path.join(dir, 'a.hl7'));
      expect(bytes.equals(asFile(SEGMENTS, '\r'))).toBe(true);
      await expect(tid(window, 'file-status')).toHaveText(`Saved a.hl7 (${bytes.length} bytes)`);
    });

    test('suggests a file name made from the message type and control ID', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('a.hl7');
      await waitForFile(path.join(dir, 'a.hl7'));
      const [call] = await getDialogCalls(electronApp, 'save');
      expect(path.basename(call.options.defaultPath)).toBe('ADT_A01_MSG0001.hl7');
    });

    test('uses LF line endings when chosen', async () => {
      await setFileOptions(window, { eol: 'lf', encoding: 'utf-8', mllp: false });
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('lf.hl7');
      expect((await waitForFile(path.join(dir, 'lf.hl7'))).equals(asFile(SEGMENTS, '\n'))).toBe(true);
    });

    test('uses CRLF line endings when chosen', async () => {
      await setFileOptions(window, { eol: 'crlf', encoding: 'utf-8', mllp: false });
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('crlf.hl7');
      expect((await waitForFile(path.join(dir, 'crlf.hl7'))).equals(asFile(SEGMENTS, '\r\n'))).toBe(true);
    });

    test('wraps the message in MLLP framing when chosen', async () => {
      await setFileOptions(window, { eol: 'cr', encoding: 'utf-8', mllp: true });
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('mllp.hl7');
      const bytes = await waitForFile(path.join(dir, 'mllp.hl7'));
      expect(bytes[0]).toBe(0x0b);
      expect([...bytes.subarray(-2)]).toEqual([0x1c, 0x0d]);
      expect(bytes.subarray(1, -2).equals(asFile(SEGMENTS, '\r'))).toBe(true);
    });

    test('encodes in UTF-8 or Windows-1252 as chosen', async () => {
      const text = HL7_MESSAGES.ADT_A01.replace('DOE^JOHN^A', 'MÜLLER^JOHN^A');
      await pasteMessage(window, text);
      await saveAs('utf8.hl7');
      const utf8 = await waitForFile(path.join(dir, 'utf8.hl7'));
      expect(utf8.includes(Buffer.from([0xc3, 0x9c]))).toBe(true);

      await setFileOptions(window, { eol: 'cr', encoding: 'windows-1252', mllp: false });
      await goTo(window, 'editor');
      await queueDialog(electronApp, 'save', { path: path.join(dir, 'w1252.hl7') });
      await tid(window, 'file-save-as').click();
      const w1252 = await waitForFile(path.join(dir, 'w1252.hl7'));
      expect(w1252.includes(Buffer.from([0xdc]))).toBe(true);
      expect(w1252.includes(Buffer.from([0xc3, 0x9c]))).toBe(false);
    });

    test('saves again to the same file without asking', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('same.hl7');
      await waitForFile(path.join(dir, 'same.hl7'));
      await tid(window, 'message').fill(`${SEGMENTS.join('\n')}\nNK1|1|DOE^JANE`);
      await tid(window, 'file-save').click();
      await expect(tid(window, 'file-status')).toContainText('Saved same.hl7');
      expect(await getDialogCalls(electronApp, 'save')).toHaveLength(1);
      expect(fs.readFileSync(path.join(dir, 'same.hl7'), 'utf8')).toContain('NK1|1|DOE^JANE');
    });

    test('Save as always asks for a file', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('first.hl7');
      await waitForFile(path.join(dir, 'first.hl7'));
      await queueDialog(electronApp, 'save', { path: path.join(dir, 'second.hl7') });
      await tid(window, 'file-save-as').click();
      await waitForFile(path.join(dir, 'second.hl7'));
      expect(await getDialogCalls(electronApp, 'save')).toHaveLength(2);
      await expect(tid(window, 'file-status')).toContainText('Saved second.hl7');
    });

    test('leaves everything as it was when the dialog is cancelled', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await tid(window, 'file-save').click();
      await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(1);
      await expect(tid(window, 'file-status')).toHaveText('');
      expect(fs.readdirSync(dir)).toEqual([]);
    });

    test('refuses to save an empty message', async () => {
      await queueDialog(electronApp, 'save', { path: path.join(dir, 'empty.hl7') });
      await tid(window, 'file-save').click();
      await expect(tid(window, 'file-status')).toContainText('There is nothing to save');
      expect(fs.existsSync(path.join(dir, 'empty.hl7'))).toBe(false);
    });

    test('shows the file name in the title and marks unsaved changes', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await saveAs('title.hl7');
      await waitForFile(path.join(dir, 'title.hl7'));
      await expect.poll(() => window.title()).toBe('title.hl7 - MsgLab');
      await tid(window, 'message').fill(`${SEGMENTS.join('\n')}\nNK1|1|DOE^JANE`);
      await expect.poll(() => window.title()).toBe('* title.hl7 - MsgLab');
      await expect(tid(window, 'message-name')).toContainText('(not saved)');
      await tid(window, 'file-save').click();
      await expect.poll(() => window.title()).toBe('title.hl7 - MsgLab');
    });
  });

  test.describe('Open', () => {
    const open = async (file) => {
      await queueDialog(electronApp, 'open', { paths: [file] });
      await tid(window, 'file-open').click();
    };

    test('shows the message of the chosen file', async () => {
      const file = path.join(dir, 'in.hl7');
      fs.writeFileSync(file, asFile(SEGMENTS, '\n'));
      await open(file);
      await expect(tid(window, 'file-status')).toHaveText('Opened in.hl7');
      await expect(tid(window, 'message')).toHaveValue(SEGMENTS.join('\n'));
      await expect.poll(() => window.title()).toBe('in.hl7 - MsgLab');
    });

    test('takes the line ending and MLLP setting from the file', async () => {
      const file = path.join(dir, 'net.hl7');
      fs.writeFileSync(file, Buffer.concat([Buffer.from([0x0b]), asFile(SEGMENTS, '\r\n'), Buffer.from([0x1c, 0x0d])]));
      await open(file);
      await expect(tid(window, 'file-status')).toContainText('Opened net.hl7');
      await goTo(window, 'settings');
      await expect(tid(window, 'file-eol')).toHaveValue('crlf');
      await expect(tid(window, 'file-mllp')).toBeChecked();
    });

    test('reads a file that is not UTF-8 as Windows-1252 and says so', async () => {
      const file = path.join(dir, 'old.hl7');
      fs.writeFileSync(file, Buffer.from(`${SEGMENTS.join('\r')}\rNK1|1|MÜLLER\r`, 'latin1'));
      await open(file);
      await expect(tid(window, 'file-status')).toContainText('Windows-1252');
      await expect(tid(window, 'message')).toHaveValue(/MÜLLER/);
      await goTo(window, 'settings');
      await expect(tid(window, 'file-encoding')).toHaveValue('windows-1252');
    });

    test('lists a file with several messages in the Bulk view', async () => {
      const file = path.join(dir, 'many.hl7');
      const batch = ['FHS|^~\\&|A|B|C|D', 'BHS|^~\\&|A|B|C|D', ...SEGMENTS, ...HL7_MESSAGES.ADT_A02.split('\r'), 'BTS|2', 'FTS|1'];
      fs.writeFileSync(file, asFile(batch, '\r'));
      await open(file);
      await expect(tid(window, 'file-status')).toContainText('2 messages, listed in the Bulk view');
      await goTo(window, 'bulk');
      await expect(tid(window, 'bulk-summary')).toHaveText('many.hl7: 2 messages (batch file)');
      await expect(window.locator('tr[data-testid^="bulk-row-"]')).toHaveCount(2);
    });

    test('keeps the text when the dialog is cancelled', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await tid(window, 'file-open').click();
      await expect.poll(async () => (await getDialogCalls(electronApp, 'open')).length).toBe(1);
      await expect(tid(window, 'message')).toHaveValue(SEGMENTS.join('\n'));
    });

    test('shows an error for a file that is not text', async () => {
      const file = path.join(dir, 'binary.hl7');
      fs.writeFileSync(file, Buffer.from([0x4d, 0x53, 0x48, 0x00, 0x01, 0x02]));
      await open(file);
      await expect(tid(window, 'file-status')).toContainText('does not look like a text file');
    });

    test('shows an error for an empty file', async () => {
      const file = path.join(dir, 'empty.hl7');
      fs.writeFileSync(file, '');
      await open(file);
      await expect(tid(window, 'file-status')).toContainText('The file is empty');
    });

    test('Save then writes back to the opened file without asking', async () => {
      const file = path.join(dir, 'back.hl7');
      fs.writeFileSync(file, asFile(SEGMENTS, '\r'));
      await open(file);
      await expect(tid(window, 'file-status')).toContainText('Opened back.hl7');
      await tid(window, 'message').fill(`${SEGMENTS.join('\n')}\nNK1|1|DOE^JANE`);
      await tid(window, 'file-save').click();
      await expect(tid(window, 'file-status')).toContainText('Saved back.hl7');
      expect(await getDialogCalls(electronApp, 'save')).toHaveLength(0);
      expect(fs.readFileSync(file, 'utf8')).toContain('NK1|1|DOE^JANE');
    });
  });

  test.describe('Unsaved changes', () => {
    const edit = async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await tid(window, 'message').fill(`${SEGMENTS.join('\n')}\nNK1|1|DOE^JANE`);
    };

    test('opening a file asks first, and Cancel keeps the text', async () => {
      const file = path.join(dir, 'other.hl7');
      fs.writeFileSync(file, asFile(HL7_MESSAGES.ORU_R01.split('\r'), '\r'));
      await edit();
      await queueDialog(electronApp, 'open', { paths: [file] });
      await tid(window, 'file-open').click(); // the box has no queued answer: Cancel
      await expect.poll(async () => (await getDialogCalls(electronApp, 'box')).length).toBe(1);
      const [box] = await getDialogCalls(electronApp, 'box');
      expect(box.options.title).toBe('Unsaved changes');
      expect(await getDialogCalls(electronApp, 'open')).toHaveLength(0);
      await expect(tid(window, 'message')).toHaveValue(/NK1\|1\|DOE\^JANE/);
    });

    test('opening a file after "Discard changes and open" replaces the text', async () => {
      const file = path.join(dir, 'other.hl7');
      fs.writeFileSync(file, asFile(HL7_MESSAGES.ORU_R01.split('\r'), '\r'));
      await edit();
      await queueDialog(electronApp, 'box', 0);
      await queueDialog(electronApp, 'open', { paths: [file] });
      await tid(window, 'file-open').click();
      await expect(tid(window, 'file-status')).toContainText('Opened other.hl7');
      await expect(tid(window, 'message')).toHaveValue(/ORU\^R01/);
    });

    test('File > New asks first; Cancel keeps the text, the other button clears it', async () => {
      await edit();
      await sendMenuCommand(electronApp, 'new');
      await expect.poll(async () => (await getDialogCalls(electronApp, 'box')).length).toBe(1);
      await expect(tid(window, 'message')).toHaveValue(/NK1/);

      await queueDialog(electronApp, 'box', 0);
      await sendMenuCommand(electronApp, 'new');
      await expect(tid(window, 'message')).toHaveValue('');
    });

    test('File > New clears at once when nothing changed', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await sendMenuCommand(electronApp, 'new');
      await expect(tid(window, 'message')).toHaveValue('');
      expect(await getDialogCalls(electronApp, 'box')).toHaveLength(0);
    });

    test('closing the window asks first, and Cancel keeps it open', async () => {
      await edit();
      await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
      await expect.poll(async () => (await getDialogCalls(electronApp, 'box')).length).toBe(1);
      const [box] = await getDialogCalls(electronApp, 'box');
      expect(box.options.buttons[0]).toBe('Close and discard the changes');
      await expect(tid(window, 'message')).toBeVisible();
    });
  });

  test.describe('File menu commands', () => {
    test('Save and Save as work from the menu', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await queueDialog(electronApp, 'save', { path: path.join(dir, 'menu.hl7') });
      await sendMenuCommand(electronApp, 'save');
      const saved = await waitForFileText(path.join(dir, 'menu.hl7'));
      expect(saved).toBe(SEGMENTS.map((line) => `${line}\r`).join(''));
      await expect.poll(() => tid(window, 'file-status').textContent()).toContain('Saved menu.hl7');
      await queueDialog(electronApp, 'save', { path: path.join(dir, 'menu2.hl7') });
      await sendMenuCommand(electronApp, 'saveAs');
      const savedAs = await waitForFileText(path.join(dir, 'menu2.hl7'));
      expect(savedAs).toBe(saved);
      await expect.poll(() => tid(window, 'file-status').textContent()).toContain('Saved menu2.hl7');
    });

    test('Open works from the menu, from any view', async () => {
      const file = path.join(dir, 'menu-in.hl7');
      fs.writeFileSync(file, asFile(SEGMENTS, '\r'));
      await goTo(window, 'settings');
      await queueDialog(electronApp, 'open', { paths: [file] });
      await sendMenuCommand(electronApp, 'open');
      await expect(tid(window, 'view-editor')).toBeVisible();
      await expect(tid(window, 'file-status')).toContainText('Opened menu-in.hl7');
    });
  });
});
