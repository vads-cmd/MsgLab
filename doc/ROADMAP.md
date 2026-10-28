# Roadmap

Plans, not promises. The order can change.

Version numbers are X.Y.Z. A big feature raises Y (0.3.0, 0.4.0, ...). Smaller steps raise Z. Version 1.0.0 comes when all planned features and message types are finished. Whether FHIR belongs to 1.0.0 or follows it is still open.

## 0.2.0 - sending messages (MLLP) - released

- Send one message: connect, send, wait for the ACK, disconnect.
- Test connection (TCP only, optionally with a test message).
- Saved connections (profiles).
- Bulk send of the Bulk tab messages on one connection, with a pace, stop-on-error, progress and a results table.
- CSV report of a bulk run.

## 0.2.x - polish and a better Send tab

- **0.2.1, small fixes**
  - Quit the app when the main window is closed on macOS.
  - Fix the app icon on Ubuntu; white outline border on the app icon.
  - Editor: duplicate line shortcut; select a line by clicking its number.
  - Redesign the look of section names in the tabs.
- **0.2.2, Send tab**
  - Split into Single and Bulk sending.
  - Preview the single message before sending.
  - Warning before sending when a message has validation errors (warn only, never block).
- **0.2.3, more control over sending**
  - Bulk send from a file (`.hl7` / `.txt`, with or without FHS/BHS).
  - Retry amount in Settings: how many times a send is tried again after a connection failure or a timeout. A message the server answered (AE/AR) is never retried.
  - `scripts/mllp-check.js`: terminal tool with a local test server (for example `serve --error-every 5`).

## 0.3.0 - history of sent messages

- Full text of every sent message (single and bulk): time, server, type, control ID, result.
- Load an entry into the editor, edit it and send it again.
- The number of entries kept is a setting; Clear history button.
- Stored locally, unencrypted, because it can contain patient data.

## 0.4.0 - editing bulk messages

- Split the message types in the Bulk tab into sections.
- Edit bulk messages in the app before sending (also to make a message invalid on purpose).

- **Type checks without a build (a small release, around 0.4.x):** `tsconfig.json` with `checkJs`, `allowJs` and `noEmit`, JSDoc types starting with `src/`, and `tsc --noEmit` run next to the tests. Nothing in the packaging changes.

## 0.5.0 - server configuration

Load the configuration of a target server from a JSON file, so that generated messages use the values that server really knows.

- A configuration is attached to a saved connection (or loaded on its own) and can hold: sending and receiving application and facility, character set and HL7 version, patient ID formats and assigning authorities, locations, doctors, code tables (diets, services, allergens, order codes and so on), and default values.
- The generator takes its values from it (MSH, PV1, ORC/OBR and so on), and the validator can check a message against it and warn about unknown values.
- The format is defined in the app and documented, with an example file. Import and export, and a check of the file with clear error messages.
- This is also the natural home for the "magic" diet-order presets.

## 0.6.0 - more ways to talk to a server

- Charset from MSH-18.
- Optional TLS.
- XML encoding for sending (as in HAPI TestPanel).

## 0.7.0 and later - message types

The standard has hundreds of message types, so they come family by family. Each family is one step (Z) and a group of families is one Y release. Every message type needs a generator, a validator and an explanation.

- **0.7.0, orders and results:** ORM, OMG, OML, ORL, ORU, OUL; the ODS, ODT and AL1 builders for ORM.
- **0.8.0, patient administration:** the rest of ADT, and similar messages.
- **0.9.0, scheduling and documents:** SIU, SRM, MDM.
- **0.10.0, financial:** DFT, BAR.
- **0.11.0, pharmacy and immunization:** ORD, RDE, RDS, RAS, VXU.
- **0.12.0, queries and master files:** QRY, QBP, RSP, MFN, MFK.
- **0.13.0 and on:** referrals, care plans, laboratory automation, clinical studies and the rest.
- The forms get redesigned again if they become overwhelming (also a candidate for its own Y release).
- The family list and the order can change as needs show up.

## FHIR (after the HL7 v2 families)

FHIR is a different standard: JSON or XML resources sent over HTTP (REST), not MLLP. It needs its own design, so it gets separate Y releases. The scope and the order below are a first guess.

Order (first guess; sending first, because it matters most and reuses the MLLP work):

1. **Send:** HTTP client for a FHIR server (create, update, read, search, transaction Bundle) with a plain JSON editor for the resource, saved server profiles (base URL, FHIR version, headers), authentication (none, Basic, Bearer token, later SMART on FHIR), a response view (status, headers, body, OperationOutcome), history, and the bulk, pace and CSV report ideas from MLLP. Tested against a local mock server and a public test server such as HAPI's (`hapi.fhir.org`), since there is no server of your own yet.
2. **Generate and validate:** common resources (Patient, Encounter, Observation, Condition, AllergyIntolerance, MedicationRequest, ServiceRequest and so on) and Bundles as JSON, with XML later. Validation for R4 first, then R4B and R5.
3. **Explain:** plain-language view of a resource, like the explanation of HL7 v2 messages.
4. **Convert:** HL7 v2 to FHIR (and maybe back) for the message types covered, using the published mappings.

Network access stays in the main process, as with MLLP.

## Before 1.0.0

- Decide on moving the project to TypeScript, just before the message families (around 0.7.0), based on how well the type checks worked. If yes, rename files one by one.
- Code signing (macOS, Windows) and Linux stores (Flathub, Snap).
- "Magic" diet-order messages (MEDITECH Magic to a diet system). They match presets on the server, so they follow server configuration (0.5.0).

## Tests

- Screenshots of failed tests in the Allure report (fixed, to be verified).
- Clean old results before each run (done for `npm run test:e2e`).
