# Dr3amy file format, version 1.0

Extension `.dr3amy`. UTF-8 JSON. MIME type when sharing: `application/json`.

## Envelope
| Field | Required | Rule |
|---|---|---|
| `$format` | yes | Must be `"dr3amy"` |
| `$version` | yes | `"MAJOR.MINOR"` string |
| `$type` | yes | `calendar`, `document`, `project`, `database`, `settings`, `workspace` |
| `metadata.name` | yes | Non-empty string |
| `metadata.created`, `metadata.modified` | yes | UTC timestamp `YYYY-MM-DDTHH:mm:ssZ` |
| `metadata.id` | no | Stable unique string; assigned on import if missing |
| `data` | yes | Object, shape depends on `$type` |

Unknown fields anywhere are preserved on read and write.

## Data shapes
- **calendar**: `timezone` (IANA string), `categories[] {id, name, color "#RRGGBB"}`, `events[]`.
  Event: `id`, `title`, `start`, optional `end`, `allDay`, `category`, `location`, `description`, `reminder` (minutes before, or null), `rrule {freq: daily|weekly|monthly|yearly, interval>=1, count>=1, until YYYY-MM-DD}`.
  Times are floating local times `YYYY-MM-DDTHH:mm`. All-day events use `YYYY-MM-DD`, and `end` is the inclusive last day.
- **document**: `content` string.
- **project**: `tasks[] {title, ...}`.
- **database**: `columns[] {name}`, `rows[]`.
- **settings**: `values` object.
- **workspace**: `items[]` of complete Dr3amy documents. A backup uses `data.preferences` for app preferences.

## Versioning
- Same major, newer minor: readable, warning shown, unknown fields preserved.
- Older known versions are migrated on parse (0.9 to 1.0: `metadata.title` becomes `metadata.name`).
- Newer major: rejected with a clear message, never modified.
- New types or fields are added in minor versions; breaking changes bump the major.

## Validation
Implemented in `core/document-engine/engine.js`; machine-readable schema in `schemas/dr3amy.schema.json`. Files over 50 MB are rejected.

## iCalendar (.ics)
Export writes floating local times, RRULE (FREQ, INTERVAL, COUNT, UNTIL), LOCATION, DESCRIPTION, CATEGORIES and a VALARM. Import reads VEVENTs and ignores unsupported properties (attendees, time zone definitions, exceptions).
