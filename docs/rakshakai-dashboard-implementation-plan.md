# RakshakAI Voice Bot Dashboard: Implementation Plan for a Coding Agent

Give this file to the agent (Claude Code or similar) as the project brief. Work through the tasks in order. Do not start a task until the previous task's acceptance checks pass.

## 1. Context

- The project is an admin dashboard for an existing voice bot that takes complaints from citizens (Marathi and English, code-switched). The bot uses Google Chirp for speech-to-text, BM25 retrieval over markdown files, an LLM for replies, TTS for speech, and a response cache.
- The dashboard has two halves: **Observe** (usage, latency, quality, cost stats) and **Control** (live bot settings, including tone selection).
- The bot handles sensitive and confidential complaints, some about police officers. Privacy and safety rules below are hard requirements, not nice-to-haves.

## 2. Working agreement for the agent

1. **Read before writing.** In Task 0, inspect the existing bot code and report what you found before changing anything.
2. **One task at a time.** After each task, run its acceptance checks, show the results, and stop for review before moving on.
3. **Small commits.** One commit per task or sub-step, with a clear message.
4. **Never add latency to the live call path.** Logging must be asynchronous and failure-tolerant. A logging failure must never break a call.
5. **Never log raw phone numbers or full transcripts by default.** Hash or mask phone numbers. Store transcripts only behind an explicit config flag, off by default.
6. **Tests required.** Every task ships with unit tests, and anything touching config or the prompt composer also gets edge-case tests.
7. **Ask, don't guess,** when the existing code contradicts this plan. List the conflict and propose options.

## 3. Target stack (change only if Task 0 shows a strong reason)

- **Database:** PostgreSQL, with migrations (Alembic)
- **Admin API:** FastAPI with Pydantic v2 models
- **Dashboard:** Next.js (TypeScript) with Recharts
- **Auth:** JWT sessions with roles (admin, reviewer, viewer)
- **Tests:** pytest for the backend, Vitest or Playwright for the frontend

## 4. Repo layout

```
/bot            existing voice bot (modify minimally)
/admin-api      FastAPI service (config, stats, auth)
/dashboard      Next.js frontend
/schemas        shared Pydantic models and JSON schema exports
/migrations     Alembic migrations
/docs           decisions and API docs
```

## 5. Data model

Tables:
- `tones` (id, name, definition_json, active)
- `config_versions` (id, version, status draft|published|archived, config_json, created_by, note, created_at)
- `config_pointer` (published_version, updated_at): single row, the bot reads only this
- `calls` (id, started_at, language, tone_id, config_version, category, outcome, duration_s, caller_hash)
- `turns` (call_id, idx, stt_ms, retrieval_ms, llm_ms, tts_ms, confidence, cache_hit, fallback)
- `audit_log` (id, user_id, action, target, before_json, after_json, at)
- `users` (id, email, password_hash, role)

Tone object:
```json
{
  "id": "empathetic",
  "name": "Warm / Empathetic",
  "sliders": { "formality": 0.6, "warmth": 0.9, "verbosity": 0.4 },
  "prompt_block": "...",
  "tts": { "voice_id": "...", "rate": 0.92, "pitch": -1, "pause_ms": 300 },
  "phrases": { "mr": { "greeting": "", "confirm": "", "goodbye": "" }, "en": { "greeting": "", "confirm": "", "goodbye": "" } }
}
```

Bot config object (the `config_json` of a version):
```json
{
  "default_language": "mr",
  "tone": {
    "default": "formal",
    "per_language": { "mr": "simple", "en": "formal" },
    "overrides": [{ "when": { "category": ["officer_misconduct", "confidential"] }, "use": "empathetic" }],
    "custom_instructions": ""
  },
  "llm": { "model": "", "temperature": 0.3, "max_tokens": 200 },
  "stt": { "provider": "google_chirp", "languages": ["mr-IN", "en-IN"] },
  "retrieval": { "method": "bm25", "top_k": 4, "min_score": 0.35 },
  "cache": { "enabled": true, "ttl_seconds": 86400 },
  "flow": {
    "working_hours": { "tz": "Asia/Kolkata", "start": "00:00", "end": "23:59" },
    "fallback_threshold": 0.5,
    "escalation_keywords": [],
    "kill_switch": false,
    "kill_switch_message": ""
  },
  "safety": { "confidential_mode": true, "blocked_topics": [] }
}
```

## 6. Hard rules

- **Prompt order is fixed:** safety layer, then tone block, then knowledge context. Tone and custom instructions can never override the safety layer.
- **The bot caches the published config for about 30 seconds.** If the database is unreachable, it keeps using the last good config. If none exists, it uses a built-in safe default.
- **Validation on save:** enum values, numeric ranges (for example temperature 0 to 1), required phrases for every supported language, and a rejected save for any unknown key.
- **Every change is audited** with before and after JSON.
- **Rollback means changing `config_pointer`,** nothing else.

## 7. Tasks

### Task 0: Discovery (no code changes)
- Inspect `/bot`: entry points, where the prompt is built, where STT, retrieval, LLM, TTS and the cache are called, and every hard-coded setting.
- Output a short report: current architecture, list of settings to move into config, proposed hook points for logging and config loading, and any conflicts with this plan.
- **Accept when:** the report exists in `/docs/discovery.md` and I have approved it.

### Task 1: Database and models
- Set up Postgres, Alembic and the Pydantic models in `/schemas` for every table in section 5.
- Seed one default tone set (formal, empathetic, simple, concise) with placeholder phrases marked `TODO_REVIEW`.
- Seed config version 1 from the settings found in Task 0.
- **Accept when:** migrations run up and down cleanly, models round-trip to JSON, and seed data loads.

### Task 2: Instrumentation in the bot
- Add an async event logger that writes `calls` and `turns` rows through a queue, with batching and a timeout.
- Record per-stage latencies, confidence, cache hit and fallback flags, language, `tone_id` and `config_version`.
- Hash phone numbers with a salted hash before storage.
- **Accept when:** 10 scripted test calls produce correct rows, a simulated database outage does not break or slow a call, and added latency is under 5 ms per turn.

### Task 3: Live config loader and prompt composer
- Build a config loader with a 30-second cache, last-good fallback, and built-in safe default.
- Build the prompt composer enforcing the fixed order in section 6.
- Wire the bot to read LLM, retrieval, cache, flow and tone settings from config, and apply TTS parameters from the selected tone.
- Implement tone resolution: category override, then per-language mapping, then default.
- **Accept when:** editing the config row changes the next call's behavior without a redeploy, tests prove the safety layer cannot be overridden by tone or custom instructions, and killing the database keeps the bot working.

### Task 4: Admin API
- Endpoints: auth (login, roles); tones CRUD; config versions (create draft, validate, diff against live, publish, rollback); stats (calls per day, latency by stage, language split, fallback rate, completion vs abandon).
- Enforce role checks (admin writes, reviewer reads and annotates, viewer reads aggregate stats only).
- Write to `audit_log` on every write.
- **Accept when:** an API test suite covers validation failures, role permissions, publish and rollback, and the audit trail.

### Task 5: Dashboard, stats pages
- Pages: overview, latency breakdown, language split, outcomes, cost estimate per call.
- Show aggregates only. No transcripts or phone numbers anywhere.
- **Accept when:** the pages render correctly against seeded data, handle empty states, and are usable on a phone-width screen.

### Task 6: Dashboard, settings pages
- Tone selector (presets plus sliders and custom instructions), per-language mapping, category overrides, persona phrases, model and threshold controls, kill switch.
- Draft, diff against the live version, publish with a required note, and one-click rollback.
- **Accept when:** a full edit, publish and rollback cycle works from the UI alone, and invalid input shows clear errors.

### Task 7: Preview and test tools
- A preview panel that runs a sample caller line through the prompt composer for a chosen tone and shows the reply text, with an optional TTS audio sample.
- A sandbox that runs a draft config without touching live traffic.
- **Accept when:** a draft can be tried end to end and never affects live calls.

### Task 8: Review queue and knowledge gaps
- A queue of low-confidence and flagged calls for reviewers, with a feedback button.
- An "unanswered questions" report (queries with no good retrieval match) to guide knowledge base edits.
- **Accept when:** flagged calls appear in the queue and reviewer actions are audited.

### Task 9: Alerts and A/B testing
- Alerts (latency spike, error rate jump, kill switch toggled) via email or webhook.
- A/B testing by tone, assigning calls by a hash of the call ID, with completion and abandon rates compared.
- **Accept when:** a simulated spike triggers one alert, and an experiment reports per-variant metrics.

### Task 10: Hardening
- Rate limiting, secrets in environment variables, backups, a retention policy for call data, and a security review checklist.
- **Accept when:** the checklist is complete and a restore from backup has been tested.

## 8. Definition of done (MVP = Tasks 0 to 6)

- A non-developer can log in, change the bot's tone, publish it, and see the effect on the next call.
- Every change is versioned, audited and reversible.
- No raw phone numbers or transcripts are visible in the dashboard.
- Latency on the live call path is unchanged within measurement noise.

## 9. Open items for the human

- Native-speaker review of all Marathi tone wording before any preset is published.
- Decision on data retention period and who may see call-level data.
- Hosting and deployment target for the admin API and dashboard.
