# "What's new" card — proposal

Status: approved 2026-10-16 with the recommended answers to every question below, plus an employer-activity item for staff. Built in one PR, since only test accounts exist so far. Adapted from WorkBase's
"What's new for you" card (`workbase/src/components/WhatsNew`,
`workbase/api/whats-new.js`).

## What it is

A short card at the top of a workspace page that answers one question:
**what changed for me since I last looked, and what should I do about it?**
Each line has a link to the right page, and coordinators get one inline
action: tick timesheets and mark them reviewed without leaving the page.

It complements the Home page rather than repeating it:

| | Home cards (today) | What's new card (proposed) |
|---|---|---|
| Shows | Standing totals ("6 open tasks") | Changes since you last clicked **Got it** ("2 new tasks for you") |
| Where | Home only | Top of most pages |
| Goes away | Never | When you click **Got it**, until something new happens |
| Acts | Links only | Links, plus bulk **Mark reviewed** for coordinators |

## How the card behaves

- **Got it** marks everything as seen. The card disappears until
  something new comes in. The "seen up to" time is saved on your Users
  record, so it follows you across devices (WorkBase keeps it in one
  browser, which is its main weakness).
- **Later** hides the card for the rest of the browser session, across
  pages, without marking anything seen.
- **Reminders** (pay week closing, required event tomorrow) are time
  windows, not "new" items. Got it silences that reminder for that week
  or that event only.
- **Quiet days show nothing.** No "all caught up" banner on every page.
  Home alone says "You're all caught up" when the feed is empty.
- **Busy days stay short.** Four lines show first, ordered by urgency,
  with "Show N more". Each line drills down to at most eight entries.
- **First visit** looks back 7 days. The server never looks back more
  than 14, so someone returning from a break gets a digest, not a flood.
- **Which pages:** every panel except Reports, Testing guide, User
  guide, Who am I and Stopwatch. Each panel carries a simple on/off flag
  in the registry, so this list is a one-line change.

Urgency colours follow the style guide: brick for "needs you now",
yellow for "waiting on your review", potomac for reminders, gray for
FYI.

## Items by role

"Since you last looked" means since your last **Got it**.

### Interns

| Item | Shows when | Opens |
|---|---|---|
| **Hours need a fix** (brick) | A timesheet was returned, or got a coordinator comment, since you last looked. Also counts any still waiting on you. | My hours |
| **New tasks for you** | Someone assigned you a task since you last looked. | My tasks |
| **Feedback on your work** | A reviewer accepted your work or asked for updates. | My tasks |
| **Submit your hours** (reminder) | From Friday of the pay week until payroll review closes, if you have drafts or are under your expected weekly hours. | Log hours |
| **Required event coming up** (reminder) | A Required event is today or tomorrow. | The event |
| **Hours approved for payroll** | Admin approved entries since you last looked, with the total. | My hours |
| **New events** | Events added since you last looked, Required ones tagged. | Events |
| **New messages** | Unread threads, with the first three subjects. Uses the inbox's existing read marker, so it clears when you open Inbox. | Inbox |

### Employers (partner mentors)

| Item | Shows when | Opens |
|---|---|---|
| **Interns need help** (brick) | A task you requested, or your org's, was marked Need Help. | Task review |
| **Work ready for your review** (yellow) | Work submitted on tasks you requested. New ones listed, total waiting counted. | Task review |
| **Discussion on your event** | New posts on an event your org hosts. | The event |
| **New events** | Program and partner events added since you last looked. | Events |
| **New messages** | Same as interns. | Inbox |

Employers never see timesheet items, coordinator comments or Staff Only
threads. That keeps the agreed rule that partners see hours only after
coordinator review, which is the employer dashboard's job, not this
card's.

### Coordinators

| Item | Shows when | Opens / action |
|---|---|---|
| **Tasks marked Need Help** (brick) | Any task moved to Need Help since you last looked, plus the count still open. | All tasks |
| **Flagged for supervisor** (brick) | A message was sent with Flag for Supervisor. | The thread |
| **Timesheets to review** (yellow) | Submitted entries still marked New for coordinator review. | **Checklist: tick entries, Mark reviewed.** Comments still happen on Review timesheets. |
| **Replies to your comments** | An intern replied on a timesheet or task you commented on. | The thread |
| **Attendance not taken** (reminder) | A Required event in the last 3 days has no attendance marked. | The event |
| **Under expected hours** (reminder) | From Thursday until payroll review closes: interns whose submitted hours this week are under their expected weekly hours. | Reports |
| **Partner review is slow** (reminder) | Work has waited on a partner for more than 3 days. A nudge to follow up. | All tasks |
| **Employer activity** | Employers added tasks for interns or scheduled events since you last looked. This also covers new partner events, so there's no separate line for them. One line with the count, drilling down to each task (who asked, for whom, due) or event (Required or Optional). Lets staff see what partners are asking of interns. | The task or event |
| **New messages** | Conversations you're part of, plus Staff Only threads. Staff can read every thread, but audit traffic has its own lines (flagged, intern replies). | Inbox |

### Admins (Admin, Super Admin)

Everything coordinators get, because Ava and Monique also review, plus
the payroll cycle:

| Item | Shows when | Opens |
|---|---|---|
| **Payroll ready to finalize** (brick near the deadline) | A pay week has ended and isn't finalized. Shows reviewed vs. not-reviewed counts and the date it auto-approves. | Pay periods |
| **Payroll finalized** | A week was finalized since you last looked, noting when the daily auto-close did it. | Pay periods |
| **New tester tickets** (Super Admin, optional) | Draft tickets came in. Useful while testing continues. Easy to switch off later. | Tickets |

## How it's built

- **One endpoint**, a new `whats-new` Netlify function behind the same
  sign-in token as every other panel. It only runs the checks for the
  caller's role, so an intern's page load makes 4–5 Airtable calls and
  a coordinator's 6–7. Each check filters by timestamp, so it reads
  only recent rows.
- **No new write paths.** The coordinator checklist calls the existing
  bulk "Mark reviewed" action on Review timesheets, with the same
  permission checks. WorkBase added a separate approve endpoint to its
  feed. Reusing ours keeps the rules in one place.
- **Visibility rules are shared, not copied.** The inbox's
  who-can-see-what logic moves into a shared helper, so the card can
  never show a message the inbox would hide.
- **Light on Airtable.** The response is cached for 3 minutes per
  browser session, so moving between Softr pages doesn't refetch. Fine
  for a program this size and well under Airtable's rate limit.
- **Skipped from WorkBase:** the one-card-per-page lock and the
  standalone embed. WorkBase needs them because its pages hold several
  iframes. Our pages embed one panel each, and auto-height already
  sizes the frame.

### Schema additions (4 fields, created via the API, schema snapshot synced in the PR)

| Table | Field | Type | Why |
|---|---|---|---|
| Users | `Whats_New_Seen_At` | Date/time | The "seen up to" time Got it saves. |
| Users | `Whats_New_Dismissed` | Long text | Reminder ids silenced by Got it. Keeps the last 40. |
| Tasks | `Status_Changed_At` | Formula `LAST_MODIFIED_TIME({Status})` | Detects "moved to Need Help" and "waiting more than 3 days". Tasks have no timestamp for this today. |
| Tasks | `Review_Changed_At` | Formula `LAST_MODIFIED_TIME({Review_Status})` | Detects "accepted" or "updates requested". |

Users already has `Latest_Softr_Visit`, but it moves on every page
load. That would swallow updates nobody read, so the card uses its own
marker.

## Build plan

One PR with every role, since the workspace only has test accounts so
far. Schema fields land first in the same branch so drift CI stays
green. Tested headlessly against the live base as the test accounts.
Demo rows are left on the @test.com accounts so testers see a full card
for each role.

## Questions for the team (all answered: recommended option)

1. **Admins get the coordinator items too?** Recommended yes, since Ava
   and Monique also review. The alternative is admins see payroll items
   only.
2. **"Under expected hours" nudges.** Show coordinators only, or also
   remind the intern directly? Recommended both: the intern sees
   "Submit your hours", which is softer.
3. **Tester tickets on the card** for Super Admins during testing?
   Recommended yes, switched off after launch.
4. **Pages without the card.** The proposed opt-outs are Reports,
   Testing guide, User guide, Who am I and Stopwatch. Anything to add?
