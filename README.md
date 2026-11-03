# Dr3amy

A local-first, private app suite: Home, Calendar, Files, Settings, on a shared document engine and the `.dr3amy` file format, a binary container with its own value encoding and CRC-32 integrity check (not JSON). Static HTML/CSS/JS, IndexedDB storage, no backend, no accounts, no telemetry.

Run: `python3 -m http.server 8080` then open http://localhost:8080
Inspect a file: `node scripts/inspect.mjs examples/personal-calendar.dr3amy`  ·  Engine tests: `node scripts/test.mjs`  ·  Rebuild examples: `node scripts/make-examples.mjs`  ·  Package: `sh scripts/package.sh`

Docs: `documentation/` (FILE-FORMAT, ARCHITECTURE, PRIVACY, DEPLOYMENT). Schema: `schemas/`. Samples: `examples/`.
Limits: browser storage is not permanent (back up); reminders only fire while a tab is open; AirDrop is reached through the native share sheet, not a web API.
