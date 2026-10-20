# Dashboard backend (Next.js route handlers)

The admin API lives in this Next.js app (`src/app/api`, logic in `src/lib/server`). It reads
the voice bot's MongoDB (`CITIZEN_DB`, default `voicebot`) directly and keeps its own data in
`dash_*` collections in the same database.

## Departures from the implementation plan

| Plan | What the bot actually does | What the backend does |
|---|---|---|
| PostgreSQL + Alembic, FastAPI | Everything is in MongoDB (`citizen_store`, `case_store`) | Next.js route handlers over the same MongoDB; no migrations, indexes are created on first request |
| `calls` / `turns` tables with STT/retrieval/LLM/TTS ms | Gemini Live is speech-to-speech; `interactions` hold duration, turn counts, tools, summary | Stats use what exists. Stage latency, fallback rate, live call count and STT confidence are reported under `notRecorded` |
| Outcome (completed / abandoned) | Not recorded | Derived (`src/lib/server/outcomes.ts`): `no_speech`, `short` (<2 caller turns or <25 s), `completed` |
| Bot settings edited from the dashboard | — | Left out: the dashboard does not change the bot's configuration |
| Lost and found | Not recorded yet (phase 3) | Figures and status only, from the bot's read-only API (`docs/bot-api-contract.md`) |

## Setup

```bash
cp .env.example .env                # fill MONGODB_URI
npm run admin -- set-password       # the control room password (writes only its hash)
npm run admin -- ping               # read-only connection check
npm run dev
```

Tests: `npm test` (unit). With a MongoDB 7+ running, `TEST_MONGODB_URI=mongodb://127.0.0.1:27099 npm test`
also runs the API suite against a throwaway database.

## Sign-in

One account, the **police control room**, which sees and does everything. There is no user
database: the password's scrypt hash is `DASHBOARD_PASSWORD_HASH` in `.env`, set with
`npm run admin -- set-password` (16+ characters in any script, or 12+ mixing three of
lowercase, capitals, digits and symbols). Changing it signs every open session out.

`POST /api/auth/login {password}` sets an httpOnly, SameSite=Strict `rakshak_session` cookie
(JWT, `DASHBOARD_SESSION_HOURS`, default 8). `POST /api/auth/logout`, `GET /api/auth/me`.
Five wrong passwords from one IP lock it out for 15 minutes.

`src/proxy.ts` guards every page and API route: pages redirect to `/login?next=…`
(`&expired=1` when an old session was rejected), API routes answer 401, and writes from other
sites get 403. The role checks inside the API stay in place so roles can be added later.

## Endpoints

Every stats endpoint and list takes `?env=prod|test` (test = browser test page traffic) and
`?from=YYYY-MM-DD&to=YYYY-MM-DD` (India time, inclusive, default last 7 days, at most 92).
Errors are `{ error: { code, message, details? } }`; validation errors (422) carry
`details: [{ path, message }]`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | public; database up/down |
| GET | `/api/stats/overview` | totals, outcomes, per-day, per-hour, channels, summary backlog, cost estimate (`COST_PER_MINUTE_INR`) |
| GET | `/api/stats/languages` | share, completion and clear rate per language |
| GET | `/api/stats/outcomes` | emergencies by category (Marathi labels) / priority / status / verdict / credibility / station; alert delivery; topics; tools |
| GET | `/api/stats/timing` | call duration by channel and buckets, emergency alert delay, after-call summary lag |
| GET | `/api/cases` | `status, priority, category, station, limit, before` (cursor = `nextBefore`) |
| GET / PATCH | `/api/cases/:id` | PATCH `{action:"status", status:"acknowledged"\|"closed", note}` or `{action:"verdict", verdict, note}`; writes `case_events` like the bot's CLI |
| GET | `/api/calls`, `/api/calls/:id` | `channel, outcome, language`; ids like `phone:abc` must be URL-encoded |
| POST | `/api/cases/:id/caller`, `/api/calls/:id/caller` | the caller's full number; each reveal is written to the audit log |
| GET | `/api/calls/:id/transcript` | the stored (already redacted) conversation; each view is written to the audit log |
| GET | `/api/lost-found/stats` | counts per status, reported / reunited per day (from the bot's API) |
| GET | `/api/lost-found` | `status`; reference, status, station and dates only (from the bot's API) |
| GET | `/api/audit` | `action, user, target, before` |

## Privacy

- Phone numbers are masked (`+91 ••••••7519`) in every list. The full number and the transcript
  are separate requests, each written to the audit log. Alert recipients and incident phone lists
  are never returned.
- Free text (descriptions, notes) has long digit runs removed, including Devanagari digits.
- Lost and found: only reference, status, station, dates and counts pass through; anything else
  the bot's API sends is dropped.
