# Workspace Testing Orientation

This guide is for the NextGen SW admin team (Ava, Mo, David). The
workspace went live with real intern accounts on October 18, 2026, so
testing now happens alongside real users. Keep test activity out of
the real program.

## Test accounts are retired

The shared test accounts (intern, employer and coordinator @test.com)
and all of their demo tasks, hours, events and messages were deleted
on October 19, 2026, so new interns start with a clean workspace.
Their old magic links no longer work.

## Checking what a role sees

- **Preview as** (Softr Studio): open the page in preview, then pick a
  real user from the **Preview as** menu. This shows what that person
  sees without logging in as them and without creating any data. It's
  the safest way to check a page.
- **Don't act as a real user.** Preview is for looking. Don't log
  hours, submit work or send messages while previewing someone else.
- **If you need to click through a flow**, add a temporary account
  under **Admin Users** with a clearly fake email (for example
  `qa-intern@nextgensw.org`) and the role you want to test. Don't add
  it to a real cohort or partner organization, because events and
  reports would show it. Delete the account and anything it created
  when you're done.

Magic links are login credentials, so they're never published in this
guide (this page and the repo are publicly readable).

## Reporting issues

Use **Submit a ticket** at the bottom of any page. It opens a short form
in a new tab and records which page you were on. Say what you expected
and what you saw; screenshots help. Wording that's confusing counts as
a bug.
