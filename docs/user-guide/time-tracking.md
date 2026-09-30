# Time Tracking

How hours flow through the workspace: you log them, the coordinator
reviews them, approved hours go to payroll.

## Logging hours (interns — and Rhonda logs her own hours too)

Open **Log hours**. One row per chunk of work:

- **Date** — the day you did the work (not the day you're logging).
- **Hrs / Min** — enter the exact time (e.g. 1 hr 20 min); it's stored to the minute, no rounding.
- **Kind of work** — pick the closest category. Working on something
  a partner assigned? Choose *Partner Task* and select the task.
- **What did you work on?** — one sentence is plenty; it helps the
  coordinator approve quickly.
- **Partner org (optional)** — if you're placed with more than one
  organization, tag which one this time was for. Handy for meetings or
  work that isn't tied to a specific task.

Add rows to log several days at once, then:

Prefer to time yourself? Use **Stopwatch** — start a timer when you begin, and "Log time" submits the exact minutes.

- **Submit for review** — sends everything to the coordinator.
- **Save as draft** — keeps entries private to you until you submit
  them from **My hours**.

## My hours

Your entries with their status:

| Status | Meaning |
|---|---|
| Draft | Only you can see it — submit or discard it |
| Submitted | Waiting for coordinator review |
| Approved | Counted for payroll — locked |
| Returned for Clarification | The coordinator has a question — read the note, fix or explain, then **Resubmit** |

The line at the top shows hours submitted this week (weeks run
Monday–Sunday).

## Reviewing hours (coordinator)

Open **Review hours** to browse all submitted timesheets. Your review
is **separate from payroll** — it's your oversight layer.

- Filter by **review state** (New / Open Comment / Approved) and by
  **who has commented** (Partner / Coordinator / Intern).
- **Mark reviewed** — records that you've looked at the entry. Use the
  checkboxes to review several at once. This does *not* change payroll.
- **Add a comment** (💬) — sends a note to the intern (they see it on
  their My hours) and flags the entry "Open Comment." You can comment
  even on an already-approved entry; it doesn't change payroll status.
  Partners don't see these notes.

## Approving for payroll (admin)

Payroll approval is a separate, admin-only step. In **Review hours**,
admins see **Approve for payroll**, which marks the entry approved and
files it under its pay week — that's what the payroll export reads.
(Coordinator review and payroll approval are independent on purpose.)

## Pay periods (staff)

Open **Pay periods**. The program runs Monday-start weeks:

- **Generate weeks** — pick the first Monday and how many weeks; the
  panel creates them back-to-back.
- **Edit** a week's dates if the calendar shifts — the system blocks
  overlaps and gaps, so adjacent weeks may need editing in order.
- **Delete** only works on weeks with no hours filed against them.

The **Current** badge marks this week. Approved hours attach to their
week automatically for export.

## The payroll cycle (admin)

On **Pay periods**, the **Payroll** column runs the cycle per week:

- It shows how many timesheets are still **to approve** vs already
  **approved** for that week.
- Set a **review-close date** — the deadline for admin review.
- **Approve all** finalizes the week now: every submitted timesheet in
  it is approved for payroll and the week is locked (green **Finalized**
  badge).
- If a week isn't finalized by its review-close date, its submitted
  hours **auto-approve** the next day, so payroll never stalls waiting
  on a review.

## Payroll export (staff)

On **Pay periods**, any week with hours shows a **CSV** button. The
file has two sections: per-intern totals (what payroll needs), then
every approved entry with its date, category, and notes.

After payroll has the file, click **Mark paid** on the same row — it
flags every approved entry in that week so nothing gets exported
twice. Entries approved later in the same week simply stay unpaid
until the next export.
