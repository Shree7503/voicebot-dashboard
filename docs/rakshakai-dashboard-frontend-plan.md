# RakshakAI Dashboard: Frontend Implementation Plan (Next.js)

Companion to `rakshakai-dashboard-implementation-plan.md`. That file covers the database, bot and admin API. This file covers only the `/dashboard` frontend. Give both to the agent. Build the frontend against the admin API contract in the main plan (Task 4); until the API exists, use the mock layer in F1.

## 1. Mandatory stack: use Next.js

The frontend **must** be built with **Next.js** (current stable version, App Router, TypeScript strict mode). Do not substitute Vite, CRA, Remix or another framework. Use these supporting libraries unless Task F0 finds a strong reason to change:

- **Framework:** Next.js App Router, React Server Components where they help, client components for interactive screens
- **Language:** TypeScript with `strict: true`
- **Styling:** Tailwind CSS with design tokens as CSS variables (see section 3)
- **Data fetching:** TanStack Query for client-side server state; server components for initial loads where the data is not user-interactive
- **Forms and validation:** React Hook Form with Zod. The Zod schemas must mirror the Pydantic models from `/schemas` (generate types from the exported JSON schema if possible)
- **Charts:** Recharts
- **Tables:** TanStack Table
- **Auth:** the admin API issues JWTs. Store the session in an httpOnly cookie and read it in Next.js middleware for route protection and role checks
- **Tests:** Vitest and React Testing Library for components, Playwright for end-to-end flows
- **Lint and format:** ESLint (next/core-web-vitals) and Prettier

## 2. Working agreement for the agent

1. One task at a time. Run the acceptance checks, show the results, and stop for review before the next task.
2. Small commits, one per task or sub-step.
3. Never render raw phone numbers, full transcripts or any caller-identifying data. The API returns aggregates and masked values only; the UI must not try to reconstruct more.
4. Every mutation shows a loading state, a success confirmation using the same verb as the button ("Publish" then "Published"), and a specific error message on failure.
5. Role checks happen in two places: Next.js middleware (route access) and the UI (hide or disable controls the role can't use). The API remains the real authority.
6. If something in the API contract is missing or ambiguous, list the gap and propose an addition instead of inventing fields.

## 3. Design direction

The audience is a few police administrators and project maintainers, not the public. They use it for short, serious tasks: check how the bot is doing, change a setting safely. Some will use a phone. The Marathi UI strings matter; use real Devanagari text in layouts, not placeholder Latin.

Before writing UI code, produce a short design plan (palette, type, layout, principles) in `/docs/frontend-design.md`, review it against the points below, and get approval.

- **Avoid the generic dashboard kit:** identical rounded cards with the same soft shadow, gradient washes, tracked-out all-caps labels over every section, a big-number-plus-sparkline hero, and an eyebrow label above every heading. Use structure (borders, grouping, numbering) only where it carries information.
- **Palette:** 4 to 6 named hex values. Pick them for this subject (a rural-police service and Maharashtra context) and check contrast ratios for every text and background pair. Don't default to cream and terracotta, or near-black with one neon accent.
- **Typography:** one or two typefaces. Choose a family with excellent Devanagari support so Marathi and English sit well together (for example from Noto or Mukta families, but make a deliberate choice and justify it). Set a clear type scale, line length under 80 characters, and slightly more line height for serif body text.
- **One memorable element:** spend boldness in one place, for example the call-quality overview or the tone selector. Keep everything else quiet.
- **Motion:** only motion that answers a user action (opening a panel, confirming a publish). Respect `prefers-reduced-motion`. No scroll-triggered entrance effects.
- **Copy:** plain sentence case, active voice, one job per label. Errors say what happened and how to fix it. Empty states say what to do next. No apologies in error messages.
- **Quality floor:** works down to 360px wide, visible keyboard focus, labelled form controls, WCAG AA contrast, colour never the only signal (important in charts).

## 4. Project structure

```
/dashboard
  /app
    /(auth)/login
    /(app)/layout.tsx            shell: nav, role-aware menu, config-status banner
    /(app)/overview
    /(app)/stats/latency
    /(app)/stats/languages
    /(app)/stats/outcomes
    /(app)/settings/tone
    /(app)/settings/persona
    /(app)/settings/behavior
    /(app)/settings/flow
    /(app)/versions              history, diff, rollback
    /(app)/preview               test a draft
    /(app)/reviews               flagged calls (reviewer role)
    /(app)/audit                 audit log (admin role)
  /components
  /lib
    /api                         typed API client
    /schemas                     Zod schemas mirroring backend
    /mock                        mock API for early development
  /middleware.ts                 auth and role gating
  /tests
```

## 5. Tasks

### F0: Discovery and design plan (no feature code)
- Read the admin API contract (Task 4 of the main plan) or its OpenAPI output. Report any missing endpoints.
- Write `/docs/frontend-design.md` following section 3.
- **Accept when:** the design plan is approved and gaps in the API contract are listed.

### F1: Project setup, API client and mock layer
- Create the Next.js app (App Router, TypeScript strict, Tailwind, ESLint, Prettier).
- Set up design tokens as CSS variables and the chosen fonts via `next/font`.
- Build a typed API client in `/lib/api`, and a mock server (MSW or route handlers) returning seeded data for every endpoint, so the UI can be built before the backend is finished.
- **Accept when:** `npm run dev`, `lint`, `typecheck` and `test` all pass, and the mock API serves seeded stats and a sample config.

### F2: Auth and app shell
- Login page, httpOnly session cookie, logout, middleware route protection, and role-aware navigation (admin, reviewer, viewer).
- A persistent banner showing the live config version and whether a draft exists.
- **Accept when:** each role sees only its allowed routes, direct URL access to forbidden routes redirects, and an expired session returns to login with a clear message.

### F3: Stats pages
- **Overview:** calls per day and hour, completion vs abandon, fallback rate, current live call count if the API provides it.
- **Latency:** stacked breakdown by stage (STT, retrieval, LLM, TTS), median and 95th percentile, with a date range filter.
- **Languages:** Marathi, English and mixed share, with STT confidence per language.
- **Outcomes:** complaint categories and escalations.
- Every chart has a text or table alternative and does not rely on colour alone.
- **Accept when:** pages render against mock data, handle loading, empty and error states, and remain readable at 360px width.

### F4: Tone selector and settings forms
- **Tone page:** preset cards (formal, empathetic, simple, concise), sliders for formality, warmth and verbosity, per-language mapping, category overrides, and a custom instructions field.
- **Persona page:** greeting, confirmation and goodbye phrases per language, voice, speaking rate and pitch.
- **Behavior and flow pages:** model, temperature, max length, cache settings, fallback threshold, escalation keywords, working hours and the kill switch.
- Forms use React Hook Form with Zod validation mirroring backend rules (ranges, enums, required phrases for every language). Show field-level errors.
- A visible note on the tone page that tone cannot override safety rules.
- The kill switch requires a confirmation dialog that states what will happen to live calls.
- **Accept when:** all forms validate correctly, unsaved changes warn before navigating away, and form state saves to a draft through the API.

### F5: Draft, diff, publish and rollback
- A draft workflow: edit, save draft, view a side-by-side diff against the live version, publish with a required note.
- A versions page listing history with author, note and timestamp, and one-click rollback with confirmation.
- Optimistic UI is not allowed for publish and rollback; wait for the server response, then show the result.
- **Accept when:** a full edit, diff, publish, rollback cycle works end to end (Playwright test), and a failed publish leaves the UI in a consistent state.

### F6: Preview and test tools
- A preview panel: enter a sample caller line, choose a draft or live tone, and see the composed reply text, and play a TTS sample if the API returns audio.
- A comparison view that shows the same line answered in two tones side by side.
- **Accept when:** previews never affect live traffic (the UI only calls the sandbox endpoints), and loading and error states are covered.

### F7: Reviews and audit
- **Reviews (reviewer role):** queue of flagged and low-confidence calls using masked data only, with a feedback action.
- **Audit (admin role):** filterable table of changes with before and after diffs.
- **Accept when:** role gating is verified in tests, and no page renders raw identifiers.

### F8: Quality pass
- Run an accessibility audit (axe in Playwright) on every page and fix all serious issues.
- Check keyboard-only use on all forms and dialogs, and verify reduced-motion behaviour.
- Check performance: no layout shift on charts, code-split heavy chart components, Lighthouse accessibility score of 95 or higher.
- Complete Marathi UI strings and check they fit in all layouts (Devanagari often needs more height and width).
- **Accept when:** the audits pass, and the build runs in production mode without warnings.

## 6. Definition of done (frontend)

- A non-developer can sign in, review the bot's stats, change the tone, preview it, publish it and roll it back.
- Each role sees and can do only what it should.
- No raw phone numbers, transcripts or caller details appear anywhere in the UI.
- The UI works on a phone-width screen and with a keyboard alone.
- The design looks specific to this project, not like a generic admin template.

## 7. Open items for the human

- Approve the design plan from F0.
- Confirm whether the UI is Marathi, English or switchable, and who reviews the Marathi strings.
- Decide the deployment target for the Next.js app (for example Vercel or your own server).
