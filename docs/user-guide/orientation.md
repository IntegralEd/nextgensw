# Workspace Testing Orientation

Welcome! This guide is for the NextGen SW team (Ava, Mo, David) to test
the workspace as different kinds of users before interns and partners
arrive.

## What you're testing

The workspace lives inside the NextGen SW Softr site. Each workspace
page contains an app panel that knows who you are from your login and
shows only what your role should see. Right now (Stage 0) the panels
are simple — the point of this round is to confirm **identity works**:
the right person, the right role, the right access.

## How to test as different users

Each test account below has its own **magic link** — opening it logs
you straight in as that user, no password.

**Use an incognito/private browser window for each identity.** Your
normal window stays logged in as you; a fresh incognito window has no
cookies, so the magic link cleanly becomes that user. To switch
identities, close the incognito window and open a new one with the
next magic link. (Two different identities in two incognito windows at
once also works in most browsers — Chrome keeps separate incognito
sessions per window only if you use different profiles, so
close-and-reopen is the reliable habit.)

## Test accounts

| Name | Role | Email | Magic link |
|---|---|---|---|
| *(populated separately — magic links are login credentials and are shared privately, not published in this guide)* | | | |

Ask David for the current test-account table.

## What to check (Stage 0)

1. Open a magic link in incognito → the Softr site should treat you as
   that user.
2. Visit the test page (the one embedding the **whoami** panel). It
   should show that user's name, email, and role — pulled live from
   the Users table, not from the link you clicked.
3. Wrong-account check: the panel verifies your login against the
   Users table. A login that isn't registered sees "Account not
   found" — it should be impossible to see someone else's profile.
4. Try a panel your role shouldn't have (once role-specific panels
   exist): you should get a polite "Not available" screen, not an
   error.

## Reporting issues

Tell David: which magic link (which user), which page, what you
expected, what you saw. Screenshots help. The panel footer text and
error screens are part of the product — if wording is confusing, that
counts as a bug.

## What's coming next

- **Stage 1:** time tracking — interns log hours, the coordinator
  reviews and approves, admins manage pay-period weeks.
- **Stage 2:** tasks — partners assign, interns update.
- **Stage 3:** messages and the inbox.
- **Stage 4:** events and cohort tools.

Each stage adds panels and a matching guide on this page.
