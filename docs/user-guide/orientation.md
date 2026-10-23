# Workspace Testing Orientation

This guide is for the NextGen SW admin team (Ava, Mo, David). The
workspace went live with real intern accounts on October 18, 2026.
Testing now happens alongside real users, in a **test sandbox** that
keeps test activity away from the real program.

## The test accounts

| Name | Role | Email |
|---|---|---|
| Intern Test | Intern | intern@test.com |
| Employer Test | Employer | employer@test.com |
| Coordinator Test | Coordinator | coordinator@test.com |

They belong to the **QA Sandbox** cohort and the **Demo Partner Org
(test)**, not to Fall 2026. Their magic links are login credentials, so
they're never published in this guide (this page and the repo are
publicly readable). David shares them directly.

**Use an incognito/private window for each test account**, so your own
login stays untouched. Close it and open a new one to switch accounts.

## What the sandbox does

- **Test accounts see a yellow "Test account" strip** at the top of every
  page.
- **Everything they create is marked as test:** tasks, timesheets,
  events, messages, and anything staff create for them.
- **Real interns and partners never see test data.** It stays off their
  Events page, Inbox, task lists and What's new card.
- **Reports and payroll leave it out.** The weekly report skips test
  accounts. Payroll exports and finalizing **never** include test hours.
- **Test and real people stay apart.** Test accounts can request tasks
  of, and message, only other test accounts and staff. Real users don't
  see test accounts in their pickers.

## Seeing test data as staff

Test data is hidden from staff views too, until you turn it on: on
**Home**, under **Test accounts & demo data**, tick **Show test data in
my views**. A yellow strip reminds you it's on, with a one-click **Hide
test data**. The switch only affects your own browser.

## View as: see exactly what someone sees

To check what a real intern, partner or coordinator sees, with their
real data, you don't need their login or a test account:

1. On **Home**, choose **View as…** (or open the View as page).
2. Pick the person and the page, then **View as**.
3. A dark strip at the top names whose view it is and that it's
   **read-only**. Browse any page they can open.
4. **Exit View as** returns you to your own view. Reloading also ends it.

Nothing you click saves anything as them: the server refuses every save,
and opening their Inbox doesn't mark their messages read. Each session
is recorded in the **View_As_Log** table (who, whom, when). View as
works for interns, partners and coordinators (real or test), not for
other admins.

Use **View as** to check what someone sees, and the **test accounts**
when a demo needs clicking through: submitting hours, approving work,
posting an event.

## Cleaning up after a demo

- **Delete one item:** open the event or task and choose **Edit**, then
  **Delete…**. The item's discussion goes with it.
- **Clear everything (admins):** on Home, **Clear test data…** deletes
  every test task, timesheet, event and message in one go. Real data is
  untouched, and the test accounts, QA Sandbox and test partner org stay
  ready for the next demo.

## Reporting issues

Use **Submit a ticket** at the bottom of any page. It opens a short form
in a new tab and records which page you were on. Say what you expected
and what you saw; screenshots help. Wording that's confusing counts as
a bug.
