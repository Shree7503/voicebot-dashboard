# What the dashboard reads from the bot

No API is needed from the bot. The dashboard reads the bot's MongoDB (`voicebot`) directly, and
only real traffic: the browser test page's `test_` collections are never read.

This file lists the fields the dashboard relies on, so a change on the bot side doesn't break it
silently. If any of these are renamed or removed, tell the dashboard side first.

## Lost and found

Lists and figures carry no item details. Opening one report shows its item details, place,
station, the call (summary and transcript) and its timeline; the caller's number is masked until
clicked, and each reveal is written to the dashboard's audit log. The phone number and IMEI
written on an item (`lostFound.itemPhone`, `lostFound.imei`, and their keys) are never read.

**Read** from `cases` where `type: "lost_found"`:

| Field | Used for |
| --- | --- |
| `_id` (`L-…` lost, `F-…` found) | Reference |
| `lostFound.kind` (`lost` / `found`) | Lost or found |
| `lostFound.group`, else `category` | Item type |
| `lostFound.item`, `brand`, `colour`, `marks`, `nameOnItem`, `when` | Item details (report page only) |
| `lostFound.state` | `open`, or `returned` / `closed` once closed |
| `status` | `closed` once closed |
| `location.spoken`, `location.english` | Where it was lost or found |
| `station.name`, `station.phone`, `station.officer` | Station |
| `description.mr`, `description.asGiven` | What the caller said (report page only) |
| `citizen.phone` | Caller, masked unless revealed |
| `interactionId` | The linked call and its transcript |
| `createdAt`, `updatedAt` | Dates, per-day counts |

From `case_events`: the report's timeline, and `match_suggested` (`data.lost`, `data.found`,
`data.score`, `data.strong`). A match is "to check" while both reports are still open.

**Written** when the control room closes a report (the **Close** button), the same way the
bot's staff commands close a case:

| Field | Value |
| --- | --- |
| `status` | `closed` |
| `lostFound.state` | `returned` (item back with its owner) or `closed` (any other reason) |
| `closedAt`, `closedBy`, `closeNote` | When, the dashboard account name, the optional note |
| `updatedAt` | Now |
| `case_events` | `{ kind: "closed", by, data: { reason, note, with? } }` (`with` = the report closed together with it) |

The bot should treat any `lostFound.state` other than `open` as finished: no more matching,
alerts or caller messages for it.

## Emergencies and calls

`cases` (`type: "emergency"`), `case_events`, `alerts`, `incidents`, `interactions`,
`transcripts`, as written by `case_store` and `citizen_store` (schemaVersion 1).

## Wanted later

- **Cost per call:** a `cost.inr` field on each `interactions` document (see the backend changes
  document). Until then "Cost today" uses `COST_PER_MINUTE_INR` from the dashboard's `.env`.
