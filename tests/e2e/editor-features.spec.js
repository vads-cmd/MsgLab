const { test, expect } = require('@playwright/test');
const {
  HL7_MESSAGES, launchApp, closeApp, waitForWindow, stubDialogs, getDialogCalls, getOpenedAddresses,
  clearDirtyState, pasteMessage, configureBulkGeneration, generateBulk, selectNoBulkTypes, openAbout,
  goTo, tid, takeScreenshotOnFailure,
} = require('./helpers');

const SEGMENTS = HL7_MESSAGES.ADT_A01.split('\r');
const pidOf = (text) => text.split(/\r\n|\r|\n/).find((line) => line.startsWith('PID|')).split('|');

test.describe('Editor and generator details', () => {
  /** @type {import('@playwright/test').ElectronApplication} */
  let electronApp;
  /** @type {import('@playwright/test').Page} */
  let window;

  test.beforeEach(async () => {
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
  });

  const messageText = () => tid(window, 'message').inputValue();
  const generateNow = async () => {
    await tid(window, 'gen-submit').click();
    await expect(tid(window, 'view-editor')).toBeVisible();
  };

  test.describe('Line numbers', () => {
    test('there is one number for every line', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await expect(window.locator('[data-testid^="message-line-"]')).toHaveCount(SEGMENTS.length);
      await expect(tid(window, `message-line-${SEGMENTS.length}`)).toHaveText(String(SEGMENTS.length));
    });

    test('an empty editor has line 1 only', async () => {
      await expect(tid(window, 'message-line-1')).toHaveText('1');
      await expect(tid(window, 'message-line-2')).toHaveCount(0);
    });

    test('the numbers follow the text as it is typed', async () => {
      await tid(window, 'message').fill('MSH|a\nPID|b\nPV1|c');
      await expect(window.locator('[data-testid^="message-line-"]')).toHaveCount(3);
      await tid(window, 'message').fill('MSH|a');
      await expect(window.locator('[data-testid^="message-line-"]')).toHaveCount(1);
    });

    test('a long line that wraps keeps one number and makes it taller', async () => {
      await tid(window, 'message').fill(`MSH|a\nPID|${'X'.repeat(800)}\nPV1|c`);
      await expect(window.locator('[data-testid^="message-line-"]')).toHaveCount(3);
      const short = await tid(window, 'message-line-1').boundingBox();
      const long = await tid(window, 'message-line-2').boundingBox();
      expect(long.height).toBeGreaterThan(short.height * 2);
    });

    test('the numbers scroll with the text', async () => {
      await tid(window, 'message').fill(Array.from({ length: 150 }, (_, i) => `NTE|${i + 1}`).join('\n'));
      await expect(tid(window, 'message-line-150')).toHaveCount(1);
      const top = await window.evaluate(() => {
        const box = document.getElementById('message');
        box.scrollTop = 400;
        return box.scrollTop;
      });
      expect(top).toBeGreaterThan(0);
      const shift = () => window.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-testid="message-gutter-inner"]')).transform).m42);
      await expect.poll(shift).toBe(-top);
    });
  });

  test.describe('Message statistics', () => {
    test('shows the number of segments and characters', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await expect(tid(window, 'message-stats')).toHaveText(`${SEGMENTS.length} segments - ${SEGMENTS.join('\n').length} characters`);
    });

    test('is empty for an empty editor', async () => {
      await expect(tid(window, 'message-stats')).toHaveText('');
    });
  });

  test.describe('ACK and Restore', () => {
    test('an ACK answers the message in the editor, and Restore brings the message back', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await goTo(window, 'generate');
      await tid(window, 'gen-type').selectOption('ACK');
      await generateNow();
      await expect(tid(window, 'message')).toHaveValue(/MSA\|/);
      await expect(tid(window, 'gen-restore')).toBeVisible();
      await tid(window, 'gen-restore').click();
      await expect(tid(window, 'message')).toHaveValue(SEGMENTS.join('\n'));
      await expect(tid(window, 'gen-restore')).toBeHidden();
      await expect(tid(window, 'gen-status')).toHaveText('Original message restored');
    });

    test('Restore is not offered for other message types', async () => {
      await pasteMessage(window, HL7_MESSAGES.ADT_A01);
      await goTo(window, 'generate');
      await tid(window, 'gen-type').selectOption('ADT^A02');
      await generateNow();
      await expect(tid(window, 'gen-restore')).toBeHidden();
    });
  });

  test.describe('Manual values', () => {
    test('a typed value ends up in the message', async () => {
      await goTo(window, 'generate');
      await tid(window, 'manual-familyName-value').fill('Smithers');
      await tid(window, 'manual-mrn-value').fill('MRN777');
      await generateNow();
      const pid = pidOf(await messageText());
      expect(pid[5]).toMatch(/^Smithers\^/);
      expect(pid[3]).toContain('MRN777');
      await expect(tid(window, 'gen-status')).toContainText('2 manual values');
    });

    test('ticking "empty" leaves the field empty and disables its box', async () => {
      await goTo(window, 'generate');
      await tid(window, 'manual-phone-empty').check();
      await expect(tid(window, 'manual-phone-value')).toBeDisabled();
      await generateNow();
      expect(pidOf(await messageText())[13]).toBe('');
    });

    test('"Set all fields empty" ticks the empty box of the fields', async () => {
      await goTo(window, 'generate');
      await tid(window, 'gen-all-empty').check();
      await expect(tid(window, 'manual-phone-empty')).toBeChecked();
      await expect(tid(window, 'manual-phone-value')).toBeDisabled();
    });

    test('fields hidden by "Show non-mandatory fields" keep their value', async () => {
      await goTo(window, 'generate');
      await tid(window, 'manual-phone-value').fill('5559999');
      await tid(window, 'manual-show-optional').uncheck();
      await expect(tid(window, 'manual-phone')).toBeHidden();
      await expect(tid(window, 'manual-hidden-note')).toHaveText('1 hidden field still applies');
      await generateNow();
      expect(pidOf(await messageText())[13]).toContain('5559999');
    });

    test('an ACK hides the patient fields, other types show them again', async () => {
      await goTo(window, 'generate');
      await expect(tid(window, 'manual-familyName')).toBeVisible();
      await tid(window, 'gen-type').selectOption('ACK');
      await expect(tid(window, 'manual-familyName')).toBeHidden();
      await tid(window, 'gen-type').selectOption('ADT^A01');
      await expect(tid(window, 'manual-familyName')).toBeVisible();
    });
  });

  test.describe('Favourite message types', () => {
    const favourite = async (type) => {
      await goTo(window, 'generate');
      await tid(window, 'gen-type').selectOption(type);
      await tid(window, 'gen-fav').click();
    };

    test('a favourite is listed first in its own group', async () => {
      await favourite('ORU^R01');
      const group = window.locator('[data-testid="gen-type"] optgroup').first();
      await expect(group).toHaveAttribute('label', /Favorites/);
      await expect(group.locator('option')).toHaveText([/ORU\^R01/]);
    });

    test('a favourite is listed first in the Bulk view and "Favorites only" selects it', async () => {
      await favourite('ORU^R01');
      await goTo(window, 'bulk');
      await expect(window.locator('[data-testid^="bulk-type-"][data-testid$="-label"]').first()).toContainText('ORU^R01');
      await tid(window, 'bulk-types-favs').click();
      await expect(tid(window, 'bulk-type-ORU-R01')).toBeChecked();
      await expect(tid(window, 'bulk-type-ADT-A01')).not.toBeChecked();
    });

    test('"Favorites only" is disabled while there are no favourites', async () => {
      await goTo(window, 'bulk');
      await expect(tid(window, 'bulk-types-favs')).toBeDisabled();
    });

    test('ticked types stay ticked when the favourites change', async () => {
      await goTo(window, 'bulk');
      await tid(window, 'bulk-type-ORU-R01').check();
      await favourite('ADT^A02');
      await goTo(window, 'bulk');
      await expect(tid(window, 'bulk-type-ORU-R01')).toBeChecked();
      await expect(tid(window, 'bulk-type-ADT-A01')).toBeChecked();
      await expect(tid(window, 'bulk-type-ADT-A02')).not.toBeChecked();
    });

    test('removing the favourite empties the group again', async () => {
      await favourite('ORU^R01');
      await tid(window, 'gen-fav').click();
      await expect(window.locator('[data-testid="gen-type"] optgroup[label*="Favorites"]')).toHaveCount(0);
    });
  });

  test.describe('Bulk list', () => {
    test('"Show" puts that message in the Editor', async () => {
      await configureBulkGeneration(window, { count: 3 });
      await generateBulk(window);
      const controlId = (await tid(window, 'bulk-row-2-control-id').textContent()).trim();
      await tid(window, 'bulk-show-2').click();
      await expect(tid(window, 'view-editor')).toBeVisible();
      await expect(tid(window, 'message')).toHaveValue(new RegExp(`\\|${controlId}\\|`));
    });

    test('a long list shows the first rows and a note about the rest', async () => {
      await configureBulkGeneration(window, { count: 205 });
      await generateBulk(window);
      await expect(window.locator('tr[data-testid^="bulk-row-"]')).toHaveCount(200);
      await expect(tid(window, 'bulk-more')).toContainText('and 5 more');
    });

    test('shows an error when no message type is ticked', async () => {
      await goTo(window, 'bulk');
      await selectNoBulkTypes(window);
      await tid(window, 'bulk-generate').click();
      await expect(tid(window, 'bulk-status')).toContainText('Choose at least one message type');
    });
  });

  test.describe('Dropping a file', () => {
    const drop = (files) => window.evaluate((list) => {
      const data = new DataTransfer();
      for (const [name, text] of list) data.items.add(new File([text], name));
      document.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    }, files);

    test('opens the dropped file, and Save then asks for a file', async () => {
      await drop([['dropped.hl7', SEGMENTS.join('\r')]]);
      await expect(tid(window, 'file-status')).toHaveText('Opened dropped.hl7');
      await expect(tid(window, 'message')).toHaveValue(SEGMENTS.join('\n'));
      await tid(window, 'file-save').click();
      await expect.poll(async () => (await getDialogCalls(electronApp, 'save')).length).toBe(1);
    });

    test('opens only the first of several dropped files and says so', async () => {
      await drop([['one.hl7', SEGMENTS.join('\r')], ['two.hl7', HL7_MESSAGES.ORU_R01]]);
      await expect(tid(window, 'file-status')).toContainText('only the first of the dropped files was opened');
      await expect(tid(window, 'message')).toHaveValue(/ADT\^A01/);
    });

    test('shows an error for a dropped file that is empty', async () => {
      await drop([['empty.hl7', '']]);
      await expect(tid(window, 'file-status')).toContainText('The file is empty');
    });
  });

  test.describe('Keyboard and dialogs', () => {
    test('Enter in a generator field generates a message', async () => {
      await goTo(window, 'generate');
      await tid(window, 'gen-seed').fill('enter-key');
      await tid(window, 'gen-seed').press('Enter');
      await expect(tid(window, 'view-editor')).toBeVisible();
      await expect(tid(window, 'message')).toHaveValue(/^MSH\|/);
    });

    test('the same seed gives the same patient', async () => {
      await goTo(window, 'generate');
      await tid(window, 'gen-seed').fill('repeatable');
      await generateNow();
      const first = pidOf(await messageText());
      await goTo(window, 'generate');
      await generateNow();
      expect(pidOf(await messageText())).toEqual(first);
    });

    test('Escape closes the About dialog', async () => {
      await openAbout(window, electronApp);
      await window.keyboard.press('Escape');
      await expect(tid(window, 'about')).toBeHidden();
    });

    test('a click outside the About dialog closes it', async () => {
      await openAbout(window, electronApp);
      await window.mouse.click(5, 5);
      await expect(tid(window, 'about')).toBeHidden();
    });

    test('the repository link is opened by the app, with the fixed address', async () => {
      await openAbout(window, electronApp);
      await tid(window, 'about-repo').click();
      await expect.poll(() => getOpenedAddresses(electronApp)).toEqual(['https://github.com/vads-cmd/MsgLab']);
      await expect(tid(window, 'about')).toBeVisible();
    });
  });

  test.describe('Safety of the window', () => {
    test('the page cannot leave the app or open new windows', async () => {
      const before = window.url();
      await window.evaluate(() => { globalThis.location.href = 'https://example.com/'; });
      await window.waitForTimeout(500);
      expect(window.url()).toBe(before);
      const opened = await window.evaluate(() => globalThis.open('https://example.com/'));
      expect(opened).toBeNull();
      expect(electronApp.windows()).toHaveLength(1);
    });

    test('the page has no access to Node.js, only to the listed functions', async () => {
      const result = await window.evaluate(() => ({
        require: typeof globalThis.require,
        process: typeof globalThis.process,
        keys: Object.keys(globalThis.hl7),
      }));
      expect(result.require).toBe('undefined');
      expect(result.process).toBe('undefined');
      expect(result.keys).toEqual(expect.arrayContaining(['validate', 'generate', 'saveMessage', 'exportMessages', 'setTheme']));
      expect(result.keys).not.toContain('ipcRenderer');
    });
  });
});
