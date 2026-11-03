# Architecture

Plain ES modules, no framework, no build step. What you see in the repo is what is deployed.

- `index.html` + `scripts/main.js`: shell, hash router (`#/home`, `#/calendar?doc=ID`, `#/files`, `#/settings`), preferences, file import, shortcuts.
- `core/document-engine`: `codec.js` (binary container + value encoding + CRC) and `engine.js` (create, parse, validate, migrate, serialize). No DOM access.
- `core/storage`: IndexedDB (`docs`, `prefs` stores).
- `core/utilities`: dates, recurrence expansion, iCalendar, DOM helpers.
- `apps/*`: each exports `default mount(root, ctx, params)` and may return a cleanup function.
- `schemas`, `examples`, `documentation`, `assets`.

Reminders run in a 30-second timer while a Dr3amy tab is open. A static site cannot wake a closed browser.
Sharing uses the Web Share API with a file. On Apple devices the native share sheet lists AirDrop; Dr3amy does not control it. Without Web Share support, the file downloads.
