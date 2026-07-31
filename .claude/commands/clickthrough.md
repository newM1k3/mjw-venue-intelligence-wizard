---
description: Click through the app end-to-end with Playwright to verify it's working
---

<!--
  PORTABLE TEMPLATE — copy this file as-is into any app's .claude/commands/clickthrough.md.
  No manual editing needed before first use: the "Last Known Configuration" section below
  starts empty on purpose and self-populates the first time this command runs in that app.
-->

## Last Known Configuration

_Last run: 2026-07-30._

- Dev URL: http://localhost:5173 (`npm run dev`, Vite default port, no explicit port config)
- Demo-data affordance: none — single website-URL input plus an optional "separate booking page" toggle (verified clean — reveals a second URL field). "Scan website" calls an AI/Netlify function not available under plain `vite dev`, so not exercised.
- Destinations (in order): single-step (pre-scan) page only, no nav bar — venue-website form.

## Instructions

Use the `webapp-testing` skill (Playwright toolkit for local web apps) to verify this app is working end-to-end. **Discover everything fresh every run** — the app may have changed since the last run (new steps added, nav renamed, port changed), so the "Last Known Configuration" above is a comparison baseline, never a shortcut to skip discovery. If any value above still reads "(not yet discovered)," this is the first run in this app — skip the diff step for that value and just record what's found.

1. **Find the dev command and port, fresh.** Read `package.json`'s `dev` script and check for a configured port in `vite.config.*`/`next.config.*`; if none is set, start the dev server and read the actual URL it prints to stdout. Install dependencies first if `node_modules` is missing. Wait until the server actually responds before continuing.
2. **Launch a Playwright browser session** against the URL from step 1.
3. **Load sample/demo data if the app offers it.** Look for an obvious affordance ("Load Demo", "Load Sample", "Try it out", seed/demo button, etc.) on the live page. If none exists, proceed with the app's default/empty state — don't force it.
4. **Discover the app's primary navigation from the live page**, every run: inspect the rendered page for a nav bar, sidebar, tab list, or wizard-step list (look for `nav`, `role="navigation"`, or a repeated set of clickable labels), and build the destination list from what's actually there right now.
5. **Click through every destination in order.** On each one, wait for it to render, take a full-page screenshot, and capture the page's heading text.
6. **Capture errors across the whole run**: browser console errors, uncaught page errors, and failed network requests. Don't just watch for a hard crash — collect and report everything, even if the app still "looks fine."
7. **Exercise any obvious derived-output actions** on each screen if present (e.g. a "Generate," "Run," "Audit," "Export," or "Save" button) and confirm the result renders without errors.
8. **Diff against "Last Known Configuration"** above (skip this step entirely on a first run, per the note above) and call out anything that changed since the last run — destinations added/removed/renamed, a different port, a different (or missing) demo-data affordance. This drift is itself useful signal about what changed during the build.
9. **Report back**: which destinations loaded cleanly, the exact text of any console/network errors found, the drift found in step 8 (or "first run, no baseline yet"), and reference the screenshots taken.
10. **Shut down the dev server** when done.
11. **Overwrite the "Last Known Configuration" section above** with this run's fresh findings, so it's an accurate baseline for next time's drift check.

If anything looks broken or produces an error, don't just report it — investigate the relevant source file and explain what's causing it before proposing a fix.
