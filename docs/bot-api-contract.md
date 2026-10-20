# Bot API the dashboard needs: lost and found (read only)

One small API on the bot side, called by the dashboard's **server** (never from a browser).
The dashboard shows lost and found as **figures and status only**: no names, descriptions,
photos or phone numbers, and no actions. The bot records reports and changes their status.

Bot settings are not part of this: the dashboard does not change the bot's configuration.

## Conventions

- **Auth:** every request carries `Authorization: Bearer <BOT_API_TOKEN>` (a long random secret
  in both `.env` files). Reject anything else with 401. Serve over HTTPS, or bind to
  `127.0.0.1` if the dashboard runs on the same server.
- **Read only:** `GET` requests only. There is no endpoint that changes anything.
- **JSON** out. Times are ISO 8601 in UTC; days (`from`, `to`, `day`) are `YYYY-MM-DD` in
  India time.
- **Errors:** `{"error": {"code": "...", "message": "..."}}` with a matching HTTP status.
- **Lists** are newest first, with `?limit=` (max 200) and `?before=<ISO time>` for the next
  page; the response has `"nextBefore"` (null on the last page).

## Statuses

| Status | Meaning |
| --- | --- |
| `open` | Reported, not found yet |
| `suggested` | A possible match is waiting to be checked |
| `reunited` | Found and returned |
| `closed` | Closed for another reason |

## `GET /lost-found/stats?from=YYYY-MM-DD&to=YYYY-MM-DD`

Counts for the overview cards and the Lost and found page.

```json
{
  "byStatus": { "open": 5, "suggested": 2, "reunited": 11, "closed": 1 },
  "perDay": [{ "day": "2026-10-20", "reported": 3, "reunited": 1 }]
}
```

- `byStatus`: reports created in the date range, by their status now.
- `perDay`: reports created, and reports reunited, on each day of the range.

## `GET /lost-found?status=&station=&from=&to=&limit=&before=`

The status list.

```json
{
  "items": [
    {
      "id": "L-100001",
      "status": "open",
      "station": "Sinnar Police Station",
      "reportedAt": "2026-10-20T06:10:00Z",
      "updatedAt": "2026-10-20T07:40:00Z"
    }
  ],
  "nextBefore": null
}
```

Each item is reference, status, station and dates only. Even if more is sent, the dashboard
keeps only these fields and drops the rest before anything reaches a browser.

## In the dashboard's `.env`

`LOST_FOUND_API_URL` (the API's base URL) and `BOT_API_TOKEN`. While either is empty, the Lost
and found page says it isn't connected yet.
