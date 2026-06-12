# Venue Intelligence Wizard

Standalone onboarding app for **ImmersiveKit**. An operator pastes their website
URL; the app scans it, uses Claude to extract the venue and its rooms, lets the
operator confirm/edit, then seeds PocketBase so every other ImmersiveKit tool
has venue data to work with.

**Stack:** React 18 + Vite + TypeScript + Tailwind + PocketBase. Netlify
serverless function for scrape + Claude parse. Same conventions as `mjw-apps-dash`.

## The 5 steps

1. **Website** — operator enters their site URL (`UrlEntryStep`). Submitting calls
   the `scrape-venue` function, which fetches the homepage, discovers and follows up
   to 4 likely rooms/experiences sub-pages (same-origin links scored on
   room/escape/experience keywords), and sends the combined text to Claude.
2. **Venue** — confirm/edit the extracted organization details (`VenueStep`).
3. **Rooms** — confirm/edit/add/remove the extracted rooms (`RoomsStep`).
4. **Review** — preview exactly what will be written (`ReviewStep`).
5. **Done** — records created; link back to the dashboard (`DoneStep`).

## Booking widgets (room data the scraper can't see)

Many venues list their rooms inside a third-party booking widget (Off The Couch,
Bookeo, Resova, FareHarbor, etc.). That content is cross-origin and
JavaScript-rendered, so a plain server-side fetch can't read the room names — only
the venue-level info (name, description) comes back reliably.

The wizard handles this gracefully rather than failing:

- **Detection** — the function sniffs the raw markup for known booking platforms
  (`BOOKING_PROVIDERS` in `scrape-venue.mjs`) and returns `booking: { detected,
  key, name }`.
- **Graceful fallback** — when no rooms are auto-detected, the Rooms step switches
  to an "Add your rooms" prompt and, if a platform was detected, names it
  ("…managed in Off The Couch, which our scan can't see inside").
- **URL override** — step 1 has an "Advanced" field where the operator can paste
  their rooms/booking page URL (`roomsUrl`); the function fetches that page too
  (cross-origin is allowed since it's explicit) and feeds it to Claude.

**Reliable fix for Off The Couch venues:** OTC has an API. A future enhancement is
to pull rooms directly from it (needs an API key + endpoint), which would fully
automate room extraction for OTC-hosted venues instead of relying on scraping.

## Auth

`src/hooks/useAuth.ts` implements the standard ImmersiveKit SSO token handoff
(reads `?token`, `authRefresh()`, strips the param, falls back to an existing
session, then a mock user if PocketBase is unreachable). Launch the wizard from
the dashboard so a real user is attached; otherwise the Review step blocks the
write and explains why.

## What it writes to PocketBase

Confirmed against the live schema: `experiences` link upward via a **`project`**
relation (there is no `organization` field on experiences), so the rooms hang off
a project, which hangs off the organization. Write order:

| Order | Collection      | Records | Notes                                          |
| ----- | --------------- | ------- | ---------------------------------------------- |
| 1     | `organizations` | 1       | the venue (`created_by` = current user)        |
| 2     | `memberships`   | 1       | current user as `owner` of the org             |
| 3     | `projects`      | 1       | a "venue" project that owns the rooms          |
| 4     | `experiences`   | N       | one per room, linked via `project`             |

The write layer is `src/lib/seedPocketbase.ts`.

### Select-field values to verify

The relations are confirmed. The remaining unknowns are the `select` field
options. They're isolated as constants at the top of `seedPocketbase.ts`; any
constant left as an empty string (`''`) is **omitted** from the create so a wrong
guess never blocks onboarding — PocketBase applies its own default and validation
errors are surfaced verbatim on the Review step.

Confirmed from the live schema:

- `ORG_STATUS='active'` — `organizations.status` is required (`active|paused|archived`). ✓
- `PROJECT_TYPE='escape_room'` — `projects.type` is required
  (`escape_room|immersive_theater|haunt|museum_experience|brand_activation|training_simulation|other`). ✓
- `PROJECT_STATUS='live'` — `projects.status` is required
  (`concept|design|production|testing|live|paused|archived`). ✓

- `EXPERIENCE_STATUS='live'` — `experiences.status` is required
  (`draft|review|approved|live|retired`). ✓
- `MEMBERSHIP_ROLE='owner'` — `memberships.role` is required
  (`owner|admin|producer|designer|viewer`). ✓
- `MEMBERSHIP_STATUS='active'` — `memberships.status` is required
  (`invited|active|disabled`). ✓

All four collections (organizations, memberships, projects, experiences) and every
required select are verified against the live schema as of June 2026.

## Local development

```bash
npm install
# Run BOTH the Vite app and the function with one command:
npx netlify dev
```

`netlify dev` serves the app and exposes the function at
`/.netlify/functions/scrape-venue`. Plain `npm run dev` runs the UI but the scan
step will fail because the function isn't running.

Set these in `.env` (see `.env.example`): `VITE_POCKETBASE_URL`,
`VITE_DASHBOARD_URL`, `ANTHROPIC_API_KEY`, and optionally `CLAUDE_MODEL`.

## Deploy (Netlify)

Auto-deploys from GitHub like the other repos. Set the same env vars in
**Site settings → Environment variables**. `netlify.toml` already points the
build at `dist` and functions at `netlify/functions`.

## Add it to the dashboard

Once it has a real URL, add `VITE_VENUE_INTELLIGENCE_WIZARD_URL` to
`mjw-apps-dash` and an entry in `src/data/apps.ts` (or wherever onboarding is
linked). The wizard is onboarding, not a tiered tool — link it from first-run /
empty-state rather than the tool grid.
