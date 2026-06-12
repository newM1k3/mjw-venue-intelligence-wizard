# Deploying the Venue Intelligence Wizard

This app deploys to **Netlify**, auto-building from the GitHub repo on every push
to `main` — same pipeline as the other ImmersiveKit tools.

Repo: `https://github.com/newM1k3/mjw-venue-intelligence-wizard`

---

## One-time: connect the repo to Netlify

1. Netlify dashboard → **Add new site → Import an existing project → GitHub**.
2. Pick `mjw-venue-intelligence-wizard`.
3. Leave **Build command** and **Publish directory** blank — Netlify reads them
   from `netlify.toml`:
   - build command: `npm run build`
   - publish: `dist`
   - functions: `netlify/functions`
4. Click **Deploy**. (The first deploy may show the scan step failing until the
   environment variables below are set — that's expected.)

---

## Environment variables (required)

The local `.env` file is gitignored and does **not** get deployed, so these must
be set in Netlify: **Site settings → Environment variables → Add a variable**.

| Variable             | Value                                   | Notes                                         |
| -------------------- | --------------------------------------- | --------------------------------------------- |
| `ANTHROPIC_API_KEY`  | *(your Anthropic API key)*              | Required. Without it the scan returns HTTP 500. Server-only — never prefix with `VITE_`. |
| `VITE_POCKETBASE_URL`| `https://immersive-kit.pockethost.io`   | PocketBase backend.                           |
| `VITE_DASHBOARD_URL` | `https://immersivekit.ca/dashboard`     | Where the "Go to dashboard" button sends operators. |
| `CLAUDE_MODEL`       | `claude-sonnet-4-6`                     | Optional. Overrides the model the scan uses.  |

After adding variables, trigger a redeploy (**Deploys → Trigger deploy → Deploy
site**) so the build picks them up.

---

## Routine updates

```bash
git add .
git commit -m "your message"
git push
```

Every push to `main` triggers an automatic Netlify build + deploy.

---

## After it has a live URL

Wire it into the dashboard (`mjw-apps-dash`):

1. Add `VITE_VENUE_INTELLIGENCE_WIZARD_URL=<the netlify url>` to the dashboard's
   Netlify env vars.
2. Link the wizard from the first-run / empty-state onboarding flow rather than the
   tool grid — it's onboarding, not a tiered tool.

---

## Verify a deploy worked

1. Open the Netlify URL. The wizard's "Website" step should load.
2. Launch it from the dashboard with `?token=...` so a real user is attached
   (otherwise the Review step blocks the write by design).
3. Run a real venue URL through all 5 steps and confirm records appear in
   PocketBase under `organizations`, `memberships`, `projects`, `experiences`.

If the scan step errors, check the function logs: **Netlify → Logs → Functions →
`scrape-venue`** — a missing/incorrect `ANTHROPIC_API_KEY` is the usual cause.
