# NextGen SW Workspace — Airtable Schema Proposal (Draft for review)

Target base: `appAWSOlM2P9kqgOV` (the existing NextGen SW base).
Source of requirements: `Reference/NextGen SW Workspace Requirements — Draft for David.docx` (Ava).
Pattern source: WorkBase base `apps7roRhnziLR2ou` — field shapes borrowed and pared down; nothing syncs across bases.

**Scope:** 8 new tables (`Cohorts`, `Partner_Orgs`, `Tasks`, `Time_Entries`, `Pay_Period`, `Events`, `Skill_Areas`, `Messages`) and small extensions to the existing `Users` and `Announcement` tables. The original `Messages` table (`tbllRFgUQ8oFjYieR`) was **renamed `Tickets`** (2026-08-28): it keeps its connected forms and All_Tickets-app sync untouched, and workspace messaging gets a purpose-built table. Everything else in Ava's doc (resources, competency tracking) is deferred or already covered.

Legend: 🔵 = borrowed from a WorkBase field · 🟢 = new for NextGen SW · ⚪ = already exists.

---

## 1. `Users` — extend existing table (`tbldH5vECddqn4Tvv`)

One table for all people: interns, Rhonda, admins, and partner mentors. External partners work because Softr invites by email and the table already has `Magic Link`.

| Field | Type | Notes |
|---|---|---|
| ⚪ Email / Full Name / Title / Photo / Magic Link / User_Session / Tickets | — | Keep as-is (`Tickets` is the former `Messages` link, renamed with the table). |
| ⚪ User_Role | singleSelect | `Coordinator` added 2026-08-28 (Rhonda). Partner mentors use the existing `Employer` role (decided 2026-08-28 — no new `Partner` choice). Full list: `Admin, SuperAdmin, Applicant, Intern, Sponsor, Employer, Inactive, Coordinator`. |
| 🟢 Cohorts | link → Cohorts (multi) | Interns typically have one; Rhonda accumulates one per term she coordinates. Since only one cohort is Active at a time, the app resolves "current cohort" as the linked cohort with `Status = Active` — never by assuming one link. |
| 🟢 Phone | phoneNumber | Ava: intern profile. |
| 🟢 Preferred_Contact | singleSelect | `Email, Text, Phone Call` |
| 🟢 Partner_Org | link → Partner_Orgs | For interns: their placement. For mentors: their org. |
| 🟢 Skills_Interests | multilineText | |
| 🟢 Weekly_Expected_Hours | number (1 dp) | Drives Rhonda's under/over-hours dashboard. |
| 🟢 Support_Notes | richText | Sensitive — Rhonda/admins only. Airtable has no field-level permissions, so hiding this is the app/Softr layer's job (never render it in intern/partner views; exclude from any API field allowlist). |
| 🟢 Inbox_Last_Checked_At | dateTime | Set by the app when the user opens their inbox; drives "new" badges (see §8). |
| 🟢 Tasks_Assigned / Tasks_Created / Time_Entries | links | Auto-created by the link fields below. |

## 2. `Cohorts` — new (no WorkBase analog)

The program's grouping unit and distribution list. One cohort has many users (interns plus Rhonda as coordinator); tasks, events, announcements, and messages can target a cohort instead of an individual.

| Field | Type | Notes |
|---|---|---|
| 🟢 Name | singleLineText | e.g. `Fall 2026`. Primary field. |
| 🟢 Status | singleSelect | `Planning, Active, Completed` — program convention: exactly one cohort is `Active` at a time; the app leans on this to resolve everyone's current cohort. |
| 🟢 Start_Date / End_Date | date | Program term. |
| 🟢 Members | link → Users | Inverse of Users.Cohort — interns + coordinator. |
| 🟢 Coordinator | link → Users | Rhonda; explicit so the app doesn't have to filter Members by role. |
| 🟢 Tasks / Events / Announcements / Messages | links | Auto-inverse of the cohort links on those tables. |
| ⚪ Created / Last_Modified | createdTime / lastModifiedTime | |

## 3. `Partner_Orgs` — new (borrowed from WorkBase `Clients`, heavily pared)

| Field | Type | Notes |
|---|---|---|
| 🔵 Name | singleLineText | Primary field. |
| 🔵 Status | singleSelect | `Prospective, Active, Inactive` (same as WorkBase). |
| 🟢 Org_Type | singleSelect | Seed with just `Nonprofit, Small Business` (decided 2026-08-28); Ava's team adds choices as they list partners. |
| 🟢 Work_Format | singleSelect | `In-person, Remote, Hybrid, Event-based` (Ava's list). |
| 🟢 Primary_Contact | link → Users | The mentor. |
| 🟢 Contacts | link → Users | All org users (inverse of Users.Partner_Org). |
| 🟢 Assigned_Interns | link → Users | Match status lives here; Rhonda/admins edit. |
| 🟢 Project_Areas | multilineText | What kind of work they offer. |
| 🔵 Admin_Notes | multilineText | Rhonda/admin only (app-layer hiding, same caveat as Support_Notes). |
| 🔵 Org_ID | formula `RECORD_ID()` | Same trick WorkBase uses for stable IDs in embeds/exports. |
| ⚪ Created / Last_Modified | createdTime / lastModifiedTime | |

## 4. `Tasks` — new (borrowed from WorkBase `Tasks`, 96 → ~20 fields)

| Field | Type | Notes |
|---|---|---|
| 🔵 Task_ID | autoNumber | Upsert/reference key, like WorkBase. |
| 🔵 Task_Name | singleLineText | Primary field. (WorkBase uses multilineText; single-line is cleaner for a simple app.) |
| 🟢 Description | richText | "What should the intern do?" |
| 🟢 Done_Looks_Like | richText | Ava calls this out explicitly — its own field so partner task-writing prompts can require it. |
| 🔵 Assigned_To | link → Users | The intern. Single-record preference on. |
| 🔵 Assigned_By | link → Users | Partner mentor, Rhonda, or admin (WorkBase `Requested_by`). |
| 🟢 Partner_Org | link → Partner_Orgs | Blank = program/cohort task from Rhonda. Powers partner scoping. |
| 🟢 Cohort | link → Cohorts | Set when a task was assigned cohort-wide; groups the fanned-out copies (see note below). |
| 🟢 Event | link → Events | Optional — a follow-up task from a session, or prep for one. |
| 🔵 Status | singleSelect | Ava's five, plainly labeled: `Not Started, In Progress, Blocked / Need Help, Ready for Review, Complete` + `Archived` for cleanup. (Dropped WorkBase's 13 numbered states.) |
| 🔵 Priority | singleSelect | `Low, Medium, High`. |
| 🔵 Est_Hours | number (2 dp) | One decimal field instead of WorkBase's duration-select + formula pair — simpler for partners. |
| 🔵 Start_Date / Due_Date | date | |
| 🟢 Skill_Area | link → Skill_Areas | Optional per Ava. A linked table (not a select) so each skill carries a definition and provenance — see §10. |
| 🔵 Links | url | Primary resource link (WorkBase `URLs`). |
| 🟢 Resources | multipleAttachments | Files attached at assignment. |
| 🟢 Ask_If_Stuck | link → Users | "Who should they ask if they get stuck?" — from Ava's partner prompts. |
| 🔵 Submitted_Work_URL | url | WorkBase `Submitted Product`. |
| 🟢 Submitted_Work_Files | multipleAttachments | |
| 🟢 Review_Status | singleSelect | `Awaiting Review, Updates Requested, Accepted` — partner's verdict, separate from intern-owned `Status`. |
| 🟢 Messages | link → Messages | Comments/questions ride the existing Messages table (threading, status, attachments already built). |
| 🟢 Time_Entries | link → Time_Entries | Auto-inverse; gives actual-vs-estimated hours per task for free. |
| ⚪ Created / Last_Modified | createdTime / lastModifiedTime | |

Borrowed WorkBase lesson: keep the assigner's instructions (`Description`, `Done_Looks_Like`) in different fields from anything the intern edits, so intern updates can never clobber the assignment text.

**Cohort-wide assignment pattern:** Rhonda assigns to a cohort → the app fans out one `Tasks` row per member (each intern needs their own `Status`), all linked to the same `Cohort` (and `Event`, if applicable) so they group in her dashboard. The cohort link is the distro list; the per-intern row is the unit of tracking.

## 5. `Time_Entries` — new (borrowed from WorkBase `Timesheets` 118 → ~15 fields, plus `Timesheet_Archive` review fields)

| Field | Type | Notes |
|---|---|---|
| 🔵 Entry_ID | autoNumber | |
| 🔵 Intern | link → Users | WorkBase `Team_Member`. |
| 🔵 Date_Worked | date | WorkBase `Date_of_Timesheet`. |
| 🔵 Minutes | number (integer) | Canonical unit, exactly like WorkBase `Minutes_Entered`; the app shows hours. |
| 🟢 Hours | formula `ROUND({Minutes}/60, 2)` | Display/export convenience. |
| 🔵 Task | link → Tasks | Optional — required only when `Work_Category = Partner Task`. |
| 🟢 Event | link → Events | Optional — hours logged against a session/event (e.g. the Monday Oct 8 cohort meeting or a field visit). App can pre-fill `Work_Category` from the event's type. |
| 🟢 Work_Category | singleSelect | Ava's list verbatim: `Partner Task, Partner Meeting, Monday Cohort Meeting, Training / Orientation, Final Project, Field Visit, Independent Learning, Other Approved Work`. |
| 🔵 Notes | richText | "What I worked on." |
| 🟢 Status | singleSelect | `Draft, Submitted, Approved, Returned for Clarification` — collapses WorkBase's 10-state lifecycle formula into the four states Ava's workflow needs. |
| 🔵 Submitted_At | dateTime | Set by the app on submit. |
| 🔵 Reviewed_By | link → Users | Rhonda (or a delegated admin). |
| 🟢 Reviewed_At | dateTime | |
| 🟢 Messages | link → Messages | The "returned for clarification" note and the intern's response live as a thread here (decided 2026-08-28 — no separate `Review_Comment` field; see §8). WorkBase's `PD_Comment` pattern, generalized. |
| 🔵 Pay_Period | link → Pay_Period | Set by the app from `Date_Worked` on submit (WorkBase links + a select; the select there has accumulated 90 stale options — link only here). |
| 🟢 Paid | checkbox | Ticked when exported to payroll; makes "what's unexported" a one-filter view. |
| ⚪ Created | createdTime | |

## 6. `Pay_Period` — new (borrowed from WorkBase, adapted to weekly)

Cadence is **weekly** (resolved 2026-08-28), but periods are **admin-defined by start/end date**, not hardcoded — the admin panel manages them, pre-seeded as Monday-start weeks.

| Field | Type | Notes |
|---|---|---|
| 🔵 Label | formula | `M/D – M/D/YY` range label; primary field (WorkBase `Pay_Period_Label`). |
| 🔵 Starting / Ending | date | Admin-defined; seeded as Mon–Sun weeks. |
| 🟢 Sequence | number (integer) | Ordinal within the program (1, 2, 3…), assigned by the seeding/create logic. Makes "current / previous / next" a simple `Sequence ± 1` lookup. Deliberately **not** an autoNumber: autoNumbers can't be renumbered if an admin deletes or inserts a week, and creation order isn't guaranteed to match date order. The API re-sorts by `Starting` and rewrites `Sequence` after any admin edit, so date order stays the source of truth and `Sequence` is a maintained convenience. |
| 🔵 Is_Current | formula | `AND(TODAY() >= Starting, TODAY() <= Ending)` — WorkBase `Current Pay Period`. |
| 🟢 Time_Entries | link → Time_Entries | Auto-inverse. |
| 🟢 Total_Hours | rollup | SUM of `Hours` — Rhonda's per-period sanity check. |
| 🔵 Pay_Period_ID | formula `RECORD_ID()` | |

**Admin panel behavior (app layer — Airtable can't enforce any of this):**
- **Pre-seeding:** a "generate weeks" action takes the program's first Monday and end date and creates one record per Mon–Sun week, numbering `Sequence` as it goes.
- **Toast blockers on save:** reject with a clear message if the new/edited period (a) overlaps an existing one, (b) leaves a gap against its date-adjacent neighbors, or (c) has `Ending < Starting`. Validation runs server-side in the Netlify Function (the panel toast is just the messenger), so a stale browser tab can't sneak a bad record in.
- After any accepted change, re-sort by `Starting` and rewrite `Sequence` so the ordinals stay dense (1…n, no holes).

## 7. `Events` — new (generalizes Ava's "Monday meeting / cohort session")

One table for anything on the program calendar; `Event_Type` distinguishes them. A cohort session (e.g. *Monday Oct 8 Session*) is an event with agenda/materials attached, attendance tracked, and time logged against it via `Time_Entries.Event`. Scales to employer, selection, and staff events without new tables.

| Field | Type | Notes |
|---|---|---|
| 🟢 Event_Name | singleLineText | Primary field, e.g. `Monday Oct 8 Session`. |
| 🟢 Event_Type | singleSelect | Seed with just `Cohort Session` (decided 2026-08-28); the team adds types (employer events, selection events, staff events…) as they need them. |
| 🟢 Event_Date | date | Plus optional `Start_Time` / `End_Time` (dateTime) if scheduling detail is wanted. |
| 🟢 Cohort | link → Cohorts | Who it's for; the distro list for reminders. Blank for staff/selection events. |
| 🟢 Partner_Org | link → Partner_Orgs | For employer events / field visits. |
| 🟢 Location_Format | singleSelect | `In-person, Virtual, Hybrid` + free-text `Location` field. |
| 🟢 Agenda | richText | |
| 🟢 Materials_URL / Materials_Files | url / multipleAttachments | |
| 🟢 Attendance | link → Users (multi) | Rhonda's Monday-meeting attendance tracking. |
| 🟢 Follow_Up_Tasks | link → Tasks | Inverse of Tasks.Event. |
| 🟢 Time_Entries | link → Time_Entries | Auto-inverse — hours logged against this event. |
| 🟢 Notes | richText | Reflection/check-in notes if used. |
| ⚪ Created / Last_Modified | createdTime / lastModifiedTime | |

## 8. `Messages` — new table (`tbl0tzwKoiyHXYFRM`); the original renamed `Tickets`

**The one conversation system for the whole workspace** (decided 2026-08-28). Any commentable item — a task, a time entry, an event, later a submitted document — gets threaded discussion by linking a root message to it. Direct and group messages are the same mechanism with **people as the anchor** instead of an item. Multiple stakeholders can comment on the same item (employer and Rhonda on one timesheet), and visibility is set per thread.

**Why a new table** (decided 2026-08-28): the original `Messages` table is really the site's ticketing pipeline — connected forms and a sync to the All_Tickets app depend on its shape. It's now named `Tickets` and stays exactly as it was (its `Users` link is renamed `Tickets` on the Users side). Workspace messaging gets its own table, borrowing the Tickets threading pattern:

| Field | Type | Notes |
|---|---|---|
| 🟢 Subject | singleLineText | Primary. The topic title on root posts (matches the "topics under original posts" UX); blank on replies. |
| 🟢 Message_Content | richText | |
| 🟢 Author | link → Users | Inverse: `Users.Messages_Authored`. |
| 🟢 Attachment | multipleAttachments | |
| 🟢 Reply_to_Message | link → Messages (self) | Threading; inverse is `Replies`. `Is_Reply` formula derives from it. |
| 🟢 Task | link → Tasks | Anchor (inverse of Tasks.Messages). |
| 🟢 Time_Entry | link → Time_Entries | Anchor — review/clarification threads on a timesheet. |
| 🟢 Event | link → Events | Anchor — prep or debrief discussion of a session, visible to the cohort. |
| 🟢 Cohort | link → Cohorts | Cohort-wide thread not tied to a specific item (the Cohort as distro list). |
| 🟢 Participants | link → Users (multi) | Anchor for DM/group threads: employer ↔ intern(s), intern ↔ intern, etc. Set on the root; a "DM" is just a 2-person thread. Inverse: `Users.Message_Threads`. |
| 🟢 Visibility | singleSelect | `All Stakeholders` (anyone who can see the item), `Cohort` (everyone in the linked cohort), `Program + Intern` (Rhonda/admins + the intern — hidden from employer), `Participants Only` (default for DM/group threads), `Staff Only` (Rhonda/admins). Enforced app-layer like all scoping. |
| 🟢 Latest_Reply_At | rollup | MAX of replies' `Created` — powers inbox sorting ("threads with recent activity") without scanning replies. (UI-created; API can't make rollups.) |
| 🟢 Flag_For_Supervisor | checkbox | Ava's "Flag for Rhonda" button, named evergreen — whoever holds the Coordinator role filters their dashboard on it. |
| 🟢 Is_Reply / Created | formula | `Is_Reply` from `Reply_to_Message`; `Created` = `CREATED_TIME()`. |

**Threading conventions (app-enforced):**
- A **root message anchors to exactly one thing** — one of Task / Time_Entry / Event / Cohort / Participants set; **replies link only to their parent** via `Reply_to_Message` and resolve their anchor through the root.
- **Replies inherit the root's `Visibility`** — a thread is one audience; a sidebar with a different audience is a new root on the same item. This is what makes Ex. 2 work: the employer sees the timesheet and its `All Stakeholders` threads, while Rhonda's `Program + Intern` thread with the intern's adjustment sits invisibly alongside.
- **Staff audit is universal**: Coordinator/Admin roles read every thread regardless of `Visibility` — including `Participants Only` DMs. No private channels on program infrastructure; the composer UI says so ("visible to program staff") so nobody has a false expectation of privacy.
- When a Documents/Submissions table lands later (résumés, deliverables), it joins the same pattern with one more anchor link — no redesign.

**Inbox & message boards (UX — queries, not schema):**
- The **homepage inbox** is one query: all threads where the viewer is a participant or a stakeholder of the anchored item, sorted by `Latest_Reply_At`, alongside alert cards (new tasks, due dates) driven by the Tasks/Time_Entries data that's already there.
- Each **item page (event, task, assignment) shows its own filtered message board** — the same table filtered to that anchor, topics as root messages with nested replies. One system, many lenses.
- **Unread tracking at launch stays coarse**: a `🟢 Inbox_Last_Checked_At` (dateTime) field on `Users`, set by the app when they open the inbox — anything with activity after it badges as new. Per-thread read receipts would need a Users × Threads junction table that Airtable record limits make expensive; it's a clean later upgrade if the coarse version isn't enough, and the daily-digest email from Ava's doc covers the away-from-app case.

## 9. `Announcement` — extend existing table (`tblbGWPTH7sWqOIGR`)

| Field | Type | Notes |
|---|---|---|
| 🟢 Cohort | link → Cohorts | Optional targeting — blank keeps today's behavior (public site banner); set, it scopes the announcement to a cohort's workspace views. The public `sync-announcement.mjs` allowlist ignores it, so nothing changes on nextgensw.org. |

## 10. `Skill_Areas` — new (seeded from BLS/O*NET, extensible by the team)

A table rather than a singleSelect so every skill carries a definition (partners see what "Interpersonal" means when tagging a task) and provenance (official taxonomy vs. program-added). Seeded from Table 1 of the BLS Monthly Labor Review article ["A new data product for occupational skills"](https://www.bls.gov/opub/mlr/2024/article/a-new-data-product-for-occupational-skills.htm) (EP skills categories mapped to O*NET elements) — full seed data in Appendix A.

| Field | Type | Notes |
|---|---|---|
| 🟢 Skill_Name | singleLineText | Primary field. |
| 🟢 Definition | multilineText | Verbatim from BLS for seeded rows; required for program-added rows too. |
| 🟢 ONET_Elements | multilineText | The mapped O*NET elements (seeded rows only). |
| 🟢 Source | singleSelect | `O*NET (BLS EP), Program-added` |
| 🟢 Added_By | link → Users | Blank for the 17 seeded rows; set by the app when a team member adds one. |
| 🟢 Active | checkbox | Retire a skill from pickers without breaking historical task links. |
| 🟢 Tasks | link → Tasks | Auto-inverse. |
| ⚪ Created | createdTime | |

---

## What's deliberately NOT borrowed from WorkBase

Billing/sprint codes, service-item rates, budgets, invoicing, vacation, capacity visualizer, newsletters, pulse checks, Gantt fields, the `Pay_Period_Select` single-select, the 13-state task status, and the 10-state timesheet lifecycle formula. Interns have one payer and one rate context — none of that machinery earns its complexity here.

## What the schema can't enforce (app/Softr layer responsibilities)

- **Partner scoping** ("see only their intern's tasks/hours") — filtered views in the app; Airtable itself has no row-level security.
- **Message visibility** — the `Visibility` select is data, not access control; every message query in the app filters by the viewer's role/relationship to the anchored item (or the `Participants` list), and the API never returns threads above the viewer's audience level. Staff audit access is a role check in the same layer.
- **Sensitive fields** (`Users.Support_Notes`, `Partner_Orgs.Admin_Notes`) — omit from every non-admin view and from any API field allowlist, same allowlist discipline as `sync-announcement.mjs`.
- **Status transitions** (only Rhonda sets `Approved`; interns can't edit approved entries) — server-side checks in Netlify Functions, verifying the asserted email against the record (tightening the known WorkBase gap).

## Open decisions before creating tables

1. ~~`User_Role`~~ (resolved 2026-08-28): `Coordinator` added; partner mentors reuse the existing `Employer` role.
2. ~~Pay-period cadence~~ (resolved 2026-08-28): weekly, admin-defined start/end dates, pre-seeded as Monday-start weeks, with server-validated no-overlap/no-gap rules and a maintained `Sequence` ordinal (see §6).
3. ~~Choice lists~~ (resolved 2026-08-28): `Skill_Area` becomes the `Skill_Areas` table seeded from BLS/O*NET (§10, Appendix A); `Org_Type` seeds with `Nonprofit, Small Business`; `Event_Type` seeds with `Cohort Session`. The team extends all three as they go.
4. ~~Time-entry clarifications~~ (resolved 2026-08-28): threaded via Messages. All commentable items (tasks, time entries, events, future documents) use the one Messages system with per-thread `Visibility`; no `Review_Comment` field (see §8).

**All decisions resolved — ready to build.**

Once approved, tables can be created via the Airtable Meta API (`AIRTABLE_PAT_SCHEMA`), then `npm run schema:sync` refreshes `docs/schema.generated.json` so the drift CI covers the new tables from day one.

---

## Appendix A — `Skill_Areas` seed data

Source: Table 1, ["A new data product for occupational skills,"](https://www.bls.gov/opub/mlr/2024/article/a-new-data-product-for-occupational-skills.htm) *Monthly Labor Review*, U.S. Bureau of Labor Statistics (2024). EP = Employment Projections program; O*NET = Occupational Information Network. All 17 rows seed with `Source = O*NET (BLS EP)`, `Active = ✓`, `Added_By` blank.

| Skill_Name | Definition | ONET_Elements |
|---|---|---|
| Adaptability | Adjusts behavior or work methods in response to new information or changing conditions; open to change and new information; maintains composure even with changing circumstances; actively learns and uses relevant knowledge to adapt to changes | Active learning; adaptability/flexibility; self-control; stress tolerance; updating and using relevant knowledge |
| Computers and information technology | Uses computers and related technology to accomplish work activities, including tasks such as sending emails, using the internet to find information, using word processor or spreadsheet applications, programming computers, designing websites, and managing computer networks | Computers and electronics; documenting/recording information; electronic mail; programming; working with computers |
| Creativity and innovation | Uses imagination to develop new insights in situations and applies innovative solutions to problems; designs, creates, and implements cutting-edge processes, ideas, or products, including artistic contributions | Fine arts; innovation; originality; thinking creatively |
| Critical and analytical thinking | Applies logic and reasoning to analyze information, identify strengths and weaknesses of various approaches and solutions to problems, and draw conclusions | Analytical thinking; analyzing data or information; critical thinking; deductive reasoning; inductive reasoning; operations analysis; systems analysis |
| Customer service | Works with external customers (for example, clients, patients, and consumers); tasks involve providing information and assistance to customers, dealing with difficult people or situations, and convincing others to buy goods or services | Customer and personal service; deal with external customers; deal with unpleasant or angry people; frequency of conflict situations; performing for or working directly with the public; selling or influencing others |
| Detail oriented | Pays close attention to all the small particulars when working on a task or project | Attention to detail; consequence of error; importance of being exact or accurate; selective attention |
| Fine motor | Coordinates the use of fingers, hands, and wrists to make precise movements | Control precision; finger dexterity; spend time using your hands to handle, control, or feel objects, tools, or controls; wrist-finger speed |
| Interpersonal | Shows understanding, friendliness, courtesy, tact, empathy, concern, and politeness to others, leading to the development and support of effective relationships | Assisting and caring for others; concern for others; establishing and maintaining interpersonal relationships; service orientation; social orientation; social perceptiveness |
| Leadership | Influences and guides others to accomplish strategic plans by leading, mentoring, taking charge, building teams, and offering direction | Coaching and developing others; coordinating the work and activities of others; developing and building teams; guiding, directing, and motivating subordinates; leadership; management of personnel resources; responsibility for outcomes and results; training and teaching others |
| Mathematics | Uses principles of mathematics rules and methods to express ideas and solve problems; tasks involve comprehending and accurately interpreting mathematical information, applying mathematical reasoning, and formulating a solution | Mathematical reasoning; mathematics (basic skill); mathematics (knowledge); number facility |
| Mechanical | Applies knowledge of machines, systems, and tools to complete tasks such as operating, monitoring, maintaining, troubleshooting, building, installing, and repairing mechanical or electrical devices and equipment | Controlling machines and processes; equipment maintenance; equipment selection; installation; mechanical; operating vehicles, mechanized devices, or equipment; operation and control; repairing; repairing and maintaining electronic equipment; repairing and maintaining mechanical equipment; troubleshooting |
| Physical strength and stamina | Uses the body to complete work-related duties, such as standing for long periods to help customers, exerting muscular force to lift heavy objects, and coordinating the movement of multiple limbs to entertain a crowd through dance or athletics | Dynamic strength; extent flexibility; gross-body coordination; gross-body equilibrium; multilimb coordination; performing general physical activities; spend time bending or twisting the body; spend time walking and running; stamina; static strength; trunk strength |
| Problem solving and decision making | Identifies complex problems, determines accuracy and relevance of information, uses judgment to develop and evaluate options, and implements solutions | Complex problem solving; freedom to make decisions; frequency of decision making; impact of decisions on coworkers or company results; judgment and decision making; making decisions and solving problems; systems evaluation |
| Project management | Applies knowledge, methods, and processes to achieve the objectives of a project; tasks involve developing, scheduling, coordinating, and managing resources, including monitoring costs, work, and contractor performance | Management of financial resources; management of material resources; monitoring and controlling resources; organizing, planning, and prioritizing work; scheduling work and activities |
| Science | Uses principles of scientific rules and methods to express ideas and solve problems; tasks involve comprehending and accurately interpreting scientific information and formulating solutions to scientific problems | Biology; chemistry; physics; science |
| Speaking and listening | Communicates verbally to convey, exchange, and receive ideas and information | Active listening; communications and media; oral comprehension; oral expression; public speaking; speaking; speech clarity; speech recognition |
| Writing and reading | Communicates in writing to convey, exchange, and receive ideas and information | Interpreting the meaning of information for others; reading comprehension; writing; written comprehension; written expression |
