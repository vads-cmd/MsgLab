# Roadmap

Plans, not promises. The order can change.

## 0.2.0 - sending messages (MLLP)

Done on `feature/mllp-sending`:

- Send one message: open the connection, send, wait for the ACK, close.
- Test connection (TCP only, optionally with a test message).
- Saved connections (profiles).
- Bulk send of the Bulk tab messages on one connection, with a pace, stop-on-error, progress and a results table.
- CSV report of a bulk run.

- Checked against a real server.
- README updated.

Still to do: Sonar run and the release.

## 0.2.1 - more ways to send

- Bulk send from a file (`.hl7` / `.txt`, with or without FHS/BHS), so messages can be edited outside the app, including broken ones.
- `scripts/mllp-check.js`: terminal tool with a local test server (for example `serve --error-every 5`).
- Warnings before sending when a message has validation errors (warn only, never block).

## Later

- Edit messages in the Bulk tab before sending (easier than editing a text file).
- Charset from MSH-18; optional TLS.
- XML encoding for sending (as in HAPI TestPanel).
- Code signing, and Linux stores (Flathub, Snap).
