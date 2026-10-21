# What the dashboard reads from the bot

No API is needed from the bot. The dashboard reads the bot's MongoDB (`voicebot`) directly, and
only real traffic: the browser test page's `test_` collections are never read.

This file lists the fields the dashboard relies on, so a change on the bot side doesn't break it
silently. If any of these are renamed or removed, tell the dashboard side first.

## Lost and found

Shown as **figures and status only**. Item details (brand, colour, marks, IMEI, the phone number
on the item, the description) and the caller's number are never read.

From `cases` where `type: "lost_found"`:

| Field | Used for |
| --- | --- |
| `_id` (`L-…` lost, `F-…` found) | Reference |
| `lostFound.kind` (`lost` / `found`) | Lost or found |
| `lostFound.group` (`phone`, `wallet`, `jewellery`, `footwear`, `other`…), else `category` | Item type |
| `lostFound.state` (`open`, then any other value such as `returned`) | Status: anything other than `open` counts as resolved |
| `status` (`closed`) | A closed case counts as resolved |
| `station.name` | Station |
| `createdAt`, `updatedAt` | Dates, per-day counts |

From `case_events` where `kind: "match_suggested"`: `data.lost`, `data.found`, `data.score`,
`data.strong`. A match is "to check" while both reports are still open.

## Emergencies and calls

`cases` (`type: "emergency"`), `case_events`, `alerts`, `incidents`, `interactions`,
`transcripts`, as written by `case_store` and `citizen_store` (schemaVersion 1).

## Wanted later

- **Cost per call:** a `cost.inr` field on each `interactions` document (see the backend changes
  document). Until then "Cost today" uses `COST_PER_MINUTE_INR` from the dashboard's `.env`.
- **A state for returned items:** when an item goes back to its owner, set `lostFound.state` to
  `returned` (any value other than `open` already counts as resolved).
