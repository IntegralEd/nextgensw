# NextGen SW Workspace — Build Plan

Companion to `WORKSPACE_SCHEMA_PROPOSAL.md`. Schema phase is **done** (2026-08-28): all 8 tables live in `appAWSOlM2P9kqgOV`, `Skill_Areas` seeded with the 17 BLS/O*NET categories, the original Messages table renamed `Tickets` (its forms/All_Tickets sync untouched) with a purpose-built `Messages` table minted for workspace threads, and `docs/schema.generated.{json,csv}` regenerated (15 tables, 257 fields — commit to green the drift CI).

New table IDs: Cohorts `tblXsOJwoqoOSpYDT` · Partner_Orgs `tbl1RbO4XsWIo4OWP` · Skill_Areas `tblfvMuMfvncJWBO5` · Pay_Period `tblSUypMwuYJonX5o` · Events `tblWXcLQ8zOH3G3aj` · Tasks `tblCqQJL1EMpI0LJx` · Time_Entries `tblAFI7T1B0FXs4yr` · Messages `tbl0tzwKoiyHXYFRM` (Tickets = `tbllRFgUQ8oFjYieR`)

---

## Will Netlify hold up? Yes.

The whole app fits Netlify's model, and we avoid the constraint that shaped WorkBase on Vercel:

| Concern | Assessment |
|---|---|
| Function count | Vercel Hobby caps a deploy at 12 serverless functions (why WorkBase multiplexes endpoints with `?fn=`). **Netlify has no per-deploy function cap** — it bills invocations, not files. We can keep one clean function per endpoint. |
| Free-tier limits | 125k function invocations/mo, 100 GB bandwidth, 300 build min/mo. A cohort program (≤ ~50 users, a few hundred requests/user/day worst case) sits far below all three. Netlify Pro is the escape valve, not a rewrite. |
| Scheduled jobs | Netlify **scheduled functions** (cron syntax in `netlify.toml`) cover the daily digest and reminder sweeps — equivalent of WorkBase's Vercel cron. |
| The real ceiling | **Airtable, not Netlify**: 5 requests/sec/base. Fine at program scale; if dashboards get chatty, add short-lived in-function caching before considering anything bigger. |
| Email | Netlify doesn't send email. Digest/notifications need a provider (Resend or Postmark; one API key, one function). Softr handles invite emails for logins, so this is only for digests/reminders. |
| Auth | Unchanged: Softr gates pages and passes identity into embeds; Netlify Functions hold the PATs and **verify the asserted email against the record being touched** (the tightening WorkBase deferred). |

## Panel system architecture — deploy panels, never touch Softr

The WorkBase/AgentAdmin pattern: Softr owns login and navigation chrome; every functional screen is a **panel** served from our own app, embedded once per Softr page with a snippet that never changes. All product work after that is a repo deploy.

**The app.** A Vite + React SPA at `app/` in this repo, built to `/app/` during the Netlify build (`netlify.toml` build becomes `npm run build:app && npm run announcement:sync`; publish stays repo root). The public site stays zero-dependency vanilla — the toolchain applies only to the workspace app.

**Panel routing.** Hash-based (`/app/#/log-hours`) — no SPA redirect config needed, one static entry point. A **panel registry** (`app/src/panels/index.js`) maps panel key → component + allowed roles:

```js
export const PANELS = {
  'home':         { component: Home,        roles: ['*'] },
  'log-hours':    { component: LogHours,    roles: ['Intern'] },
  'review-hours': { component: ReviewHours, roles: ['Coordinator', 'Admin', 'SuperAdmin'] },
  ...
}
```

Adding a screen = adding a registry entry and a component, then deploy. Renaming, splitting, or redesigning panels never touches Softr.

**The embed contract** — the only thing Softr ever holds, kept in git as `Reference/softr-workspace-embed.html` (source of truth, per house convention):

```html
<iframe src="https://nextgensw.org/app/#/PANEL_KEY?email={LOGGED_IN_USER:email}"
        style="width:100%;height:100vh;border:0"></iframe>
```

One Softr page per audience section, each pasting the same snippet with a different `PANEL_KEY`. Softr user groups decide who can reach the page; the panel registry + API enforce it regardless.

**Identity handshake (tightened vs WorkBase).** The app reads the Softr-asserted `email` param (postMessage fallback, WorkBase `identity.js` pattern) and calls `/api/me`, which verifies the email exists in `Users`, resolves role/cohort/partner-org, and returns a short-lived HMAC-signed token binding email + role. Every subsequent API call carries the token in a header; functions verify the signature **and** check the record being touched belongs to that identity. Tokens-in-header rather than cookies sidesteps third-party-cookie blocking inside the Softr iframe entirely. Softr's page gating becomes defense-in-depth, not the security boundary.

**Shared server lib.** `netlify/functions/_lib/airtable.mjs` modeled on WorkBase `api/_lib/airtable.js`: table/field ID constants generated from `docs/schema.generated.json`, per-role field allowlists (`Support_Notes` and `Admin_Notes` never serialize to non-staff), and the visibility filter for Messages queries.

## Staged build (each stage = deployed panels + guide update + retrain flag cleared)

**Stage 0 — Shell.** ✅ Built 2026-08-30. App scaffold (`workspace-app/` → builds to `/app/`), hash router, panel registry (`home`, `whoami`), identity handshake, `/api/me` (`netlify/functions/me.mjs` + `_lib/workspace.mjs`), embed contract (`Reference/softr-workspace-embed.html`). Verified locally against the live base: whoami renders the verified profile; unknown panel and unregistered email get friendly screens; tampered tokens rejected. **Before first deploy:** set `AIRTABLE_PAT_READ` and `WORKSPACE_SESSION_SECRET` (e.g. `openssl rand -hex 32`) in Netlify env vars, commit, then paste the embed into a gated staging Softr page. *Remaining exit test: change a panel, deploy, see it update in Softr with no Softr edit.*

**Stage 1 — Time tracking (Ava's required core; launchable alone).**
Panels: `log-hours` (intern, mobile-first; category, task/event link, draft → submit; server assigns `Pay_Period` from `Date_Worked`), `my-hours` (status, returned-for-clarification threads), `review-hours` (coordinator queue: approve / return — opens a Messages thread; missing-hours view), `pay-periods` (admin: Monday-week seeding, edit with server-validated no-overlap/no-gap toasts, `Sequence` renumbering), CSV export with `Paid` marking.

**Stage 2 — Tasks.**
Panels: `my-tasks` (intern list + status updates + submit work), `assign-task` (employer, Ava's guided prompts — each prompt is a schema field), `partner-tasks` (employer review, `Review_Status`), `all-tasks` (coordinator: blocked/overdue lenses).

**Stage 3 — Messaging & inbox.**
Panels: `home` (alert cards: new tasks, due dates, new messages, missing hours), `inbox` (unified, sorted by `Latest_Reply_Datetime`, `Inbox_Last_Checked_At` badging), thread view + DM/group compose. Visibility enforcement and staff-audit access land in the API here; item pages (task/event/entry) grow their filtered message boards.

**Stage 4 — Events & cohort ops.**
Panels: `events` + `event-detail` (agenda, materials, attendance, log-hours-against-event, event message board), `cohort-admin` (members, cohort-wide task fan-out — one row per member).

**Queued — Employer dashboard (build after the intern/team functional pages).**
One unified panel for partner mentors: their intern(s), active tasks, tasks awaiting partner review, and **timesheet visibility only after coordinator processing** — employers see entries once Approved (post-review), never the Submitted queue or clarification threads. Decided 2026-08-31.

**Stage 5 — Notifications & reporting.**
Scheduled function → per-user daily digest (email provider) + Monday-meeting reminders; `reports` panel (hours by intern, task completion, partner engagement, funder export).

**Continuous — `user-guide` panel.** Renders per-role markdown from `docs/user-guide/` (WorkBase `build-guides.mjs` pattern: compiled to JSON at build). Same content trains the helper agent, and the UX-freshness CI check keeps it honest.

## CI checks (add both now)

**1. Schema drift — already exists**, `.github/workflows/schema-drift.yml`. The regenerated snapshot brings the 7 new tables under its protection the moment it's committed. Optional hardening: add a nightly `schedule:` trigger so drift surfaces without waiting for a push.

**2. UX / user-guide freshness — new**, ported from WorkBase's `guides-freshness.yml` + `scripts/check-guides-freshness.mjs` (the AgentAdmin pattern):
- User-facing paths (`index.html`, `assets/js/**`, `assets/css/**`, `netlify/functions/**`, workspace app pages) changed in a PR with **no change under `docs/user-guide/`** → the check fails with: *"UX changed — update the user guide and retrain the helper agent."*
- Escape hatch: `[skip guides]` in the HEAD commit message for genuinely invisible changes.
- The failure message is the developer flag David described: guide edit + helper-agent retrain happen together before merge.
- `/user-guide` itself: a `docs/user-guide/` directory of per-role markdown (intern, partner, coordinator, admin) rendered as a workspace page — same content that trains the helper agent, so one source feeds both.

## Remaining manual Airtable steps (API can't do these)

Done 2026-08-28 by David: autoNumbers (`Tasks.Task_ID`, `Time_Entries.Timesheet_ID`), rollups (`Pay_Period.Total_Hours`, `Messages.Latest_Reply_Datetime`, `Messages.Reply_Count`), `Messages.Created_Datetime` + `Message_ID`, and all stale-field deletions from the Tickets split except one. Still open:

1. **Delete `Users.ZZ_DELETE_Tickets_Participants`** (the one leftover), then re-run `npm run schema:sync`.
2. **Single-record toggle** ("allow linking to multiple records" → off) on the single-target links: Cohorts.Coordinator; Tasks Assigned_To / Assigned_By / Partner_Org / Cohort / Event / Skill_Area / Ask_If_Stuck; Time_Entries Intern / Task / Event / Reviewed_By / Pay_Period; Users.Partner_Org; Messages anchors (Task / Time_Entry / Event / Cohort / Author / Reply_to_Message); Announcement.Cohort; Partner_Orgs.Primary_Contact.
3. Optional: convert `Pay_Period.Label` primary to a range formula (the seeding function writes it either way).

Note: `Created` / `Last_Modified` fields were created as `CREATED_TIME()` / `LAST_MODIFIED_TIME()` formulas (API can't create the native field types) — functionally equivalent. After any manual step above, run `npm run schema:sync` and commit.

## Env / secrets to add (Netlify site settings)

- `AIRTABLE_PAT_WRITE` — already present (contact/interest functions), **but re-scope it**: it was created with `data.records:create` only; workspace mutations (approve hours, update task status, edit pay periods, post messages) need `data.records:read` + `data.records:write` on this base. The functions layer is the only writer — the browser never holds a PAT.
- `AIRTABLE_PAT_READ` — used by `me` and all read endpoints (already used at build time; must also be set in Netlify env for functions).
- `EMAIL_API_KEY` + `EMAIL_FROM` — Phase 6, digest provider.
- Never a PAT in Softr custom code or client JS (the one WorkBase habit we're not importing).
