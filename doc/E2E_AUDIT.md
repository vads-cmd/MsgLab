# End-to-end test audit

Made for version 0.2.2 by reading all 23 files in `tests/e2e` and checking them against `index.html`, `renderer.js` and the current behaviour of the app. Nothing in the tests was changed. Line numbers are those of the files at the time of the audit.

## In numbers

- 509 tests in 22 spec files (and `helpers.js`).
- Every test starts the whole app: 509 launches, one worker, no `beforeAll`. This is why a full run takes about 17 minutes.
- 149 fixed waits (`waitForTimeout`): `send-bulk` 56, `send` 48, `helpers` 35, `settings` 23, `ui-navigation` 8, `file-operations` 7, `manual-values` 6, the rest 1 to 3 each.
- Test ids: all 274 static ids in the page are checked. Every id used by a test exists in the page (the ids built from a variable, such as `bulk-type-ORU-R01` or `explain-segment-N-name`, were checked by hand and are fine).

## 1. Tests that fail now (caused by the 0.2.2 tabs)

The legends of the two cards were removed when the mode switch became real tabs.

| Test | Why | What to do |
|---|---|---|
| `send-bulk.spec.js:47` shows Bulk send card with legend | `send-card-bulk-title` does not exist any more | Delete. The labels of the tabs are already checked by "mode buttons have correct labels" (`send.spec.js:867`) |
| `send.spec.js:51` shows Message card with legend | `send-card-message-title` does not exist any more | Delete, same reason |

## 2. Duplicates

Identical bodies (safe to delete one of each pair):

- `error-handling.spec.js:36` handles whitespace-only message = `validation.spec.js:73`
- `error-handling.spec.js:54` handles malformed HL7 message = `validation.spec.js:66`
- `file-operations.spec.js:153` shows editor status bar = `ui-navigation.spec.js:220`
- `send.spec.js:77` Send button is enabled after pasting a message = `send.spec.js:673`
- `send-bulk.spec.js:467` Save report button appears after send = `send-bulk.spec.js:702`

Same topic, probably the same assertions (check, then delete or merge):

- Theme: `settings.spec.js:203, 210, 219, 225` repeat `theme.spec.js:56, 32/40/48, 88/95`. Keep `theme.spec.js` and `theme-apply.spec.js`.
- File options: `settings.spec.js:135, 148, 161` repeat `file-operations.spec.js:69, 87, 135` (line ending, encoding, helper).
- Folders: `settings.spec.js:239` "shows folder settings" is covered by `folders.spec.js`.
- `send.spec.js:662` Send button disabled with empty editor = `send.spec.js:73`; `send.spec.js:673` also repeats `:77`.
- `send-bulk.spec.js:279` Send all disabled with no messages = `send-bulk.spec.js:107`.
- `send-bulk.spec.js:123` Save report hidden initially and `send-bulk.spec.js:698` export button hidden before any send are the same check.
- `file-operations.spec.js:27` and `ui-navigation.spec.js:155` (same title), `manual-values.spec.js:26` and `ui-navigation.spec.js:147` (same title).
- `ui-navigation.spec.js:202` message stats and `:210` line numbers repeat `editor-features.spec.js:320` and the "Line numbers" group.
- `about.spec.js:154` (Escape and click outside) repeats `editor-features.spec.js:516, 522`.
- `generation.spec.js:185` favorite button toggles star repeats `favorites.spec.js:39`.
- `generation.spec.js:103` and `:176` (different HL7 version/versions).
- `clipboard.spec.js:52, 60` repeat `bulk-generation.spec.js:121`.
- `error-handling.spec.js:185, 207` and `ui-navigation.spec.js:174` repeat `validation.spec.js:133, 141`.
- `explanation.spec.js:48` and `:140` (segment names/descriptions).
- Same title, different feature, only rename: `send.spec.js:212` and `:331` "shows ok status class on success" (Test connection / Send), `Cancel button is hidden initially` in `send.spec.js:146` and `send-bulk.spec.js:119`, `has status output elements` in both.

## 3. Weak or too thin tests

- `send-bulk.spec.js:494` "Cancel button appears during send": it clicks Cancel and then only waits 3 seconds. It never checks that the run stopped. Add: the status says "Cancelled after ...", the Send all button is enabled again, and the mock server received fewer than all messages.
- `send.spec.js:509` and `:520` run the same mismatch scenario twice. One test with two `expect`s is enough.
- The nine tests in "Send message" (`323` to `388`) send the same message to a fresh mock server each time, and the "Test connection" tests do much the same. Merge each group into two or three tests with `expect.soft`.
- Roughly 45 tests (a rough count) only check that an element exists ("shows X label", "has Y button", "shows Z row" in `folders`, `export`, `manual-values`, `about`, `send`, `send-bulk`, `settings`). Each costs a full app launch. One test per card with `expect.soft` for all its elements gives the same coverage for a tenth of the time.
- `send-bulk.spec.js:763, 767, 771`: "visible" checks for wrapper rows, no behaviour.
- Most of `error-handling.spec.js` ("handles X") only checks that nothing crashes. Fine, but each could also check one visible result.

## 4. Missing

Added in 0.2.x and not covered:

- The send settings are not in `persistence.spec.js`: host, port, timeouts, encoding, pace, custom seconds, stop-on-error, and the chosen mode (Single/Bulk). Also saved connections after a restart.
- Keyboard: arrow keys on the mode tabs.
- Ctrl/Cmd+D and then Undo (Cmd+Z) removes the copy in one step.
- Closing the last window quits the app (all systems, including macOS).
- The ACK and Raw reply `<details>`: opening and closing them (`send-ack-summary`, `send-raw-summary` are the only interactive ids no test uses). Copy ACK is only checked for existing, never clicked.
- Single send: the Cancel button stops a send that is waiting (`send-cancel` is never clicked).
- ACK outcomes: CE and CR (enhanced mode errors).
- Profiles: names that differ only in case, the 100-profile limit, the dropdown going back to "Not saved" when a field is changed, profiles surviving a restart.
- Bulk send: reconnecting after the server closes the connection (the mock server has `closeAfterReply`; the row says "Connected again"), the countdown between messages, a custom pace that is empty or above 3600, an empty host, the Cancel result.
- CSV report: the file content (columns, quoting, the apostrophe before `=`, `+`, `-`, `@`). The dialog stubs used for Save and Export can be reused.
- The confirmation dialog with validation errors in some messages ("N of M messages have validation errors"). The tests only check the case with no errors. This needs a list with an invalid message, so it fits after bulk messages can be edited.

## 5. Speed and flakiness

- **Fixed waits.** `waitForTimeout(300)` after clicking the mode tab and similar waits can be replaced by `expect(...).toBeVisible()` or `expect.poll(...)`. Most of the 149 waits are of this kind.
- **Launches.** Read-only checks (UI structure, defaults, labels) can share one launch with `test.beforeAll` and `test.describe.configure({ mode: 'serial' })`. Tests that change state keep a launch each.
- **Workers.** Every launch has its own `--user-data-dir` and the mock servers use free ports, so two or three workers should work. The clipboard tests use the system clipboard, so run `clipboard.spec.js` on its own (a second Playwright project) before raising `workers`.
- The checks named "no expect" by the first scan in `theme-apply.spec.js:57, 66` are fine: they use `expect.poll`.
