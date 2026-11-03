# Dr3amy file format, version 1.0 ("DR3A")

Extension `.dr3amy`. A compact **binary container**. It is not JSON, not XML and not a zip. Use `node scripts/inspect.mjs file.dr3amy` to look inside one.

## Layout (all integers little-endian)
| Offset | Size | Field |
|---|---|---|
| 0 | 8 | Signature `89 44 52 33 0D 0A 1A 0A` (`\x89 D R 3 \r \n ^Z \n`). The high byte and line endings make text-mode corruption detectable. |
| 8 | 1 | Format major version |
| 9 | 1 | Format minor version |
| 10 | 1 | Document type code: 1 calendar, 2 document, 3 project, 4 database, 5 settings, 6 workspace |
| 11 | 1 | Flags (reserved, write 0) |
| 12 | 4 | Payload length N (u32) |
| 16 | N | Payload: one encoded value, which must be a map |
| 16+N | 4 | CRC-32 (IEEE) of bytes 0 to 16+N-1 |

The file length must equal 20 + N exactly. Truncated, padded or checksum-mismatched files are rejected.

## Value encoding (payload)
Each value starts with a one-byte tag.
| Tag | Meaning | Body |
|---|---|---|
| 0x00 | null | none |
| 0x01 / 0x02 | false / true | none |
| 0x03 | integer | zigzag varint (|n| < 2^51) |
| 0x04 | float | 8 bytes, IEEE-754 double |
| 0x05 | string | varint byte length, UTF-8 bytes |
| 0x06 | list | varint count, then values |
| 0x07 | map | varint count, then (varint-length UTF-8 key, value) pairs |

Varints are base-128, low group first, high bit means "more", at most 8 bytes. Nesting is limited to 64 levels. Unknown tags are errors.

## Payload map
`metadata` (map), `data` (map), plus any extra keys, which are preserved. The type and version come from the header, so they cannot disagree with the payload.
- `metadata`: `name` (required), `created`, `modified` (UTC `YYYY-MM-DDTHH:mm:ssZ`), `id` (optional unique string).
- `data` depends on type:
  - **calendar**: `timezone`, `categories[] {id, name, color "#RRGGBB"}`, `events[] {id, title, start, end?, allDay?, category?, location?, description?, reminder? (minutes), rrule? {freq daily|weekly|monthly|yearly, interval?, count?, until?}}`. Times are floating local `YYYY-MM-DDTHH:mm`; all-day uses `YYYY-MM-DD` with inclusive `end`.
  - **document**: `content` string. **project**: `tasks[] {title, ...}`. **database**: `columns[] {name}`, `rows[]`. **settings**: `values` map. **workspace**: `items[]` of complete documents (a backup also carries `preferences`).

## Versioning and compatibility
- Same major, newer minor: opened with a warning; unknown fields preserved.
- Known older versions are migrated on read (0.9 to 1.0 renames `metadata.title` to `metadata.name`).
- Newer major or unknown type code: rejected as unsupported without modifying anything.
- Reserved flag bits and new tags/types arrive in minor or major bumps.

## Validation
Reading a file does: signature, version, length, CRC, structural decode, then schema validation (`core/document-engine/engine.js`). `schemas/dr3amy.schema.json` describes the decoded logical model for tooling; it is not the on-disk encoding.

## iCalendar
`.ics` import/export is supported for interchange. Export writes floating local times, RRULE, LOCATION, DESCRIPTION, CATEGORIES and VALARM. Import ignores attendees, time zone definitions and exceptions.
