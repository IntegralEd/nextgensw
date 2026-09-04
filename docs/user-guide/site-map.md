# Site map

Every page in the workspace, who sees it, and the panel it runs. Each
Softr page embeds one panel by its key (the `#/…` below). This map is
checked in CI against the live panel list, so it never drifts.

## Home & messages

- **Workspace home** — `#/home` — everyone. Alert cards + quick actions.
- **Inbox** — `#/inbox` — everyone. All your conversations.

## Time tracking

- **Record timesheets** — `#/log-hours` — interns & staff. Log hours & minutes.
- **Stopwatch** — `#/stopwatch` — interns & staff. Time work live, log the minutes.
- **My hours** — `#/my-hours` — interns & staff. Your entries & status.
- **Review timesheets** — `#/review-hours` — staff. Approve / return.
- **Pay periods** — `#/pay-periods` — staff. Weeks, CSV export, mark paid.

## Tasks

- **My tasks** — `#/my-tasks` — interns & staff. Your assigned tasks.
- **Task requests** — `#/assign-task` — everyone. Request a task of anyone.
- **Task review** — `#/partner-tasks` — everyone. Tasks you requested.
- **All tasks** — `#/all-tasks` — staff. Program-wide, filters & export.

## Events & cohorts

- **Events** — `#/events` — everyone. Sessions, attendance, log hours.
- **Cohorts** — `#/cohort-admin` — staff. Roster & cohort-wide tasks.

## Help

- **User guide** — `#/user-guide` — everyone. These guides, searchable.
- **Testing guide** — `#/testing-guide` — admins only. QA & test accounts.

## Diagnostics

- **Who am I** — `#/whoami` — everyone. Shows your verified identity;
  used to confirm sign-in during setup.

---

Roles: "staff" = Coordinator, Admin, SuperAdmin. "everyone" = any
signed-in workspace user. Gating is enforced by the app regardless of
how a Softr page is configured — the Softr user groups are the tidy
front door, the app is the lock.
