# NextGen SW — Build Plan & Workplan

> Living document. Owners listed beside each task; status updates flow from
> the Airtable **Workplan** table (this doc mirrors it for at-a-glance review).
> Source: `docs/BUILD_PLAN.md` in the [GitHub repo](https://github.com/IntegralEd/nextgensw).

---

## 1 · Where things stand

**Public site** — [nextgensw.org](https://nextgensw.org) is live on Netlify, custom domain configured, deploys auto-trigger on push to `main`. All twelve sections from the original guidance doc are built. Brand palette extracted from launch deck slide 19 and applied as CSS tokens. Logo + horizontal lockup are SVGs. Photo of mentor + interns is the hero. Hub-and-spoke donation viz at $3,600 is animated on scroll. Squiggle motif and yellow hand-drawn underlines are the connective brand tissue.

**Working CTAs**
- Donate / Sponsor → Jotform `252113228540143`
- Partner Interest Survey → Google Form `1FAIpQLSfV...DxDlw`
- Apply / Refer → marked **Coming soon** (form `1FAIpQLScj...A` is drafted but not published)

**Live integrations**
- YouTube launch video embedded in Learn More
- Google Slides modal (preview + open-in-new-tab)
- Program flyer modal (preview + download)

**Not yet wired**
- Team headshots (placeholder initials in cards)
- Live early-supporter wordmarks
- Mailing-list capture
- Feedback / admin / stakeholder pages

---

## 2 · Outstanding website items

| # | Item | Owner | Status | Notes |
|---|---|---|---|---|
| W1 | Upload team headshots (Thelma, Rhonda, Ava, Monique) | Ava | Open | Square crops, ≥400×400, JPG or PNG. Drop in `assets/img/team/`. |
| W2 | Approve & publish intern application form | Ava | ✅ Done | Live: `assets/js/main.js` `APPLY_URL` points at the published Google Form. Both Apply CTAs (hero + Three Asks) open it in a new tab. Constraint: the form requires Google sign-in because it has a resume upload (Google Forms gates file-upload questions to authed users — not a togglable setting). If drop-off shows the gate is a problem, the fix is moving resume collection to a non-Forms tool (Typeform / Tally / Jotform) or accepting a Drive-share link instead of a file upload. |
| W3 | Confirm fiscal-sponsor language for donate card | Ava | Open | Add "Tax-deductible through SWNA" line if accurate. |
| W4 | Replace placeholder body photos w/ permissioned local images | Ava | Open | Need 2–3 community photos (waterfront, scholarship night, mentor mtg). |
| W5 | Compile early supporter list for Three-Asks marquee | Ava | Open | Org names + (optional) wordmarks for a quiet supporters strip. |
| W6 | Decide on Donate vs. Apply hierarchy long-term | Team | Open | Currently Donate leads in hero. Revisit after launch event. |
| W7 | OG social card (1200×630) for QR / SMS / social shares | David | Open | Logo + tagline + brick band. |
| W8 | Add testimonial pull-quote block (alum or scholarship recipient) | Ava+David | Open | One named voice, 40–60 words, headshot. |

**Convention**: all SW Village (SWNA YATF) program tasks route to **Ava** as program coordinator. Thelma and Rhonda are advisors / approvers — they confirm, but Ava drives the work and updates Workplan rows.

---

## 3 · /feedback page (Phase 1 — this week)

**Goal:** mirror the public page on the left, with a Softr-powered comment + screenshot + file-upload form on the right rail. Anyone with the URL can submit; entries land in the Airtable **Feedback** table.

**Architecture**
```
nextgensw.org/feedback
├── Left  ~62%  → iframe of the public site (no chrome changes)
└── Right ~38%  → iframe of Softr feedback page
                  (form posts to Airtable "Feedback" table)
```

**Build steps**

| # | Item | Owner | Status |
|---|---|---|---|
| F1 | Build `feedback/index.html` on Netlify with two-column iframe layout (sticky right rail) | David | Open |
| F2 | Confirm Softr feedback form URL (Airtable-connected) | David | Open |
| F3 | Wire `?section=…` query param so each section's "Suggest edit" button pre-fills the Softr form | David | Open |
| F4 | Add small "💬 Suggest edit" floating button per section on the public site, gated by `?admin=1` query param | David | Open |
| F5 | Test screenshot upload flow (Softr's native file field → Airtable attachments) | Ava | Open |

**No auth required at first.** The URL is unguessable enough for friendly review. Add Softr login gating in Phase 2.

---

## 4 · /admin page (Phase 2 — post-launch)

**Goal:** Logged-in admin dashboard for managing applications, calendars, content updates, and the workplan itself.

```
nextgensw.org/admin
└── iframe of Softr admin app (single-page, role-gated)
    ├── Dashboard (active feedback, open tasks, applications waiting review)
    ├── Workplan (this doc's mirror)
    ├── Applications inbox (interns, sponsors, employers)
    ├── Contacts (mailing list, with interest checkboxes)
    └── Section-by-section feedback log
```

**Auth model**: Softr User Groups → only `Admin` users see the admin app. Embed appears as `<iframe>` on the Netlify page; if the user isn't logged in, the iframe shows the Softr login screen, which redirects back after auth.

| # | Item | Owner | Status |
|---|---|---|---|
| A1 | Set up Softr workspace + connect Airtable base | David | Open |
| A2 | Create Admin user group + invite client team | Ava | Open |
| A3 | Build admin dashboard page in Softr | David | Open |
| A4 | Build `admin/index.html` on Netlify with Softr embed | David | Open |
| A5 | Document onboarding/login process for new admins | Ava | Open |

---

## 5 · Stakeholder pages (Phase 3 — over time)

Same pattern as `/admin`: Netlify shell, Softr embed, role-gated.

| Path | Audience | Initial purpose |
|---|---|---|
| `/interns` | Accepted cohort members | Weekly check-ins, mentor info, payment confirmations, project board |
| `/sponsors` | Donors at any level | Tax receipts, impact updates, sustainer milestones, photos from cohort |
| `/employers` | Partner organizations | Intern matching info, project briefs, weekly hour logs, evaluation forms |
| `/mentors` | 1:1 mentors | Cohort matching, meeting notes, training resources |

Each is one Softr page filtered by role + a Netlify HTML shell with the embed.

---

## 6 · Airtable schema (starting point)

> You have prototype DBs for this — bring those over. Below is a minimal
> reference shape for the tables this site will touch.

### Users
| Field | Type | Notes |
|---|---|---|
| name | Single line | |
| email | Email | Synced from Softr |
| role | Single select | Admin / Intern / Sponsor / Employer / Mentor / Partner |
| softr_user_id | Single line | Used for filtered views |
| status | Single select | Active / Pending / Archived |

### Feedback (used by `/feedback`)
| Field | Type | Notes |
|---|---|---|
| section | Link → Sections | "hero", "why", "timeline", etc. |
| author | Link → Users | Optional for anonymous submitters |
| note | Long text | |
| screenshot | Attachment | Native Airtable upload |
| files | Attachment | Multi-file |
| priority | Single select | Low / Med / High |
| status | Single select | New / Triaged / In progress / Done / Won't do |
| page_url | URL | Which page they were on |
| created | Created time | |
| handled_by | Link → Users | Who's resolving it |

### Sections (seed once)
| Field | Type | Notes |
|---|---|---|
| id | Single line | Anchor: `hero`, `why`, `why-now`, `pathway`, `legacy`, `how`, `timeline`, `gains`, `team`, `building`, `stat`, `asks`, `learn-more` |
| title | Single line | Display name |
| anchor | Formula | `"#" & {id}` |
| current_screenshot | Attachment | Periodically refreshed |

### Workplan (this doc, mirrored)
| Field | Type | Notes |
|---|---|---|
| ref | Single line | W1, W2, F1, A1… (matches doc) |
| title | Single line | |
| description | Long text | |
| owner | Link → Users | |
| status | Single select | Open / In progress / Blocked / Done |
| priority | Single select | Low / Med / High |
| due_date | Date | |
| related_section | Link → Sections | If task is section-specific |
| related_form | Single select | Donate / Apply / Partner / Mailing / Sponsor pledge / Mentor / Story |
| attachments | Attachment | |
| notes | Long text | |
| updated | Last modified time | |

### Contacts (mailing list — fed by Web3Forms)
| Field | Type | Notes |
|---|---|---|
| name | Single line | |
| email | Email | |
| zip | Single line | Optional |
| interested_in_sponsor | Checkbox | |
| interested_in_intern | Checkbox | |
| interested_in_employer | Checkbox | |
| interested_in_mentor | Checkbox | |
| source | Single select | Site / Event / Referral / QR code |
| consent | Checkbox | "OK to contact about NextGen SW updates" |
| created | Created time | |

### Applications, Sponsorships, Stories — sketched, build out as forms come online (Phase 3).

---

### Messages-table workaround formulas (interim)

Softr's URL-parameter pre-fill of the form's `Section` and `URL` fields
isn't catching, so the long landing URL of the form (with
`?Section=…&URL=…` appended) lands in the `URL` field instead. Two
formula fields parse the bits we need until the Softr-side mapping
is sorted out.

**`Section_Parsed`** — pulls the section anchor (`why`, `top`, …):

```
IFERROR(
  SUBSTITUTE(
    REGEX_EXTRACT({URL}, "Section=[^&]+"),
    "Section=",
    ""
  ),
  ""
)
```

**`Page_URL_Parsed`** — pulls the embedded URL param and decodes the
three URL-encoded chars our links use (`%3A → :`, `%2F → /`, `%23 → #`):

```
IFERROR(
  SUBSTITUTE(
    SUBSTITUTE(
      SUBSTITUTE(
        SUBSTITUTE(
          REGEX_EXTRACT({URL}, "URL=[^&]+"),
          "URL=", ""
        ),
        "%3A", ":"
      ),
      "%2F", "/"
    ),
    "%23", "#"
  ),
  ""
)
```

Both return `""` when the parameter isn't present, so older or
non-pill submissions don't break. To copy the parsed values into
editable single-line fields, add an Airtable Automation on
record-create that does `Section ← Section_Parsed` and
`URL_Page ← Page_URL_Parsed`.

The cleaner long-term fix: in Softr's form editor, set the Section
field's **Default value** to the `Section` URL parameter token, and
same for URL. Once that's wired the formulas become defensive
backstop rather than load-bearing.

---

## 7 · Forms inventory

If you give the repo Airtable secrets (`AIRTABLE_BASE_ID` + write-scoped PAT), these are the forms worth wiring server-side via a Netlify Function. Anything that doesn't need server logic can be a Web3Forms or Softr form posting directly to Airtable.

| # | Form | Lands in | Recommended channel | Notes |
|---|---|---|---|---|
| 1 | **Mailing list / Stay in touch** | Contacts | Web3Forms → Netlify Function → Airtable | Footer + thank-you page after every CTA. Checkboxes for sponsor / intern / employer / mentor interest. |
| 2 | **Suggest edit (per section)** | Feedback | Softr embedded form | Pre-filled with section ID via URL param. |
| 3 | **General contact / Question** | Feedback (or new "Inquiries") | Web3Forms | Simple "got a question?" link in footer. |
| 4 | **Sponsor pledge / Multi-year commitment** | Sponsorships | Softr (auth) | Multi-step form, captures org details, pledge amount, pay schedule. |
| 5 | **Mentor signup** | Users + new "MentorApplications" | Softr (auth optional) | Background, availability, area of expertise. |
| 6 | **Employer / Project intake** | Employers | Softr (auth optional) | Project briefs, hours offered, supervision capacity. |
| 7 | **Story / Testimonial submission** | Stories | Web3Forms | Alum, mentor, supporter quotes — easy stream of social-proof content. |
| 8 | **Event RSVP / Launch event signup** | Contacts (with `source: Event`) | Web3Forms or Softr | One-off, but useful for the launch meeting and community open houses. |
| 9 | **Speaker / press inquiry** | Inquiries | Web3Forms | Less urgent; nice to have. |
| 10 | **Volunteer for one-time event** | Contacts (with checkbox) | Web3Forms | Lower-commitment than mentor; broadens funnel. |

**Mailing list flow (recommended for launch):**

1. Visitor enters email + checks any/all interest boxes
2. Web3Forms posts to a Netlify Function (`/.netlify/functions/contact`)
3. Function validates + writes to Airtable Contacts table via PAT
4. (Optional) Tags `interested_in_sponsor=true` triggers a Softr automation that drops them into a "Sponsor outreach" view for follow-up
5. Confirmation page: "Thanks — we'll be in touch when [intern apps / sponsor briefings / etc.] open."

---

## 8 · Workplan table — initial seed

Drop these straight into the Airtable Workplan table. They'll mirror back into this doc as we hit them.

| Ref | Title | Owner | Priority | Due |
|---|---|---|---|---|
| W1 | Upload team headshots | Ava | High | TBD |
| W2 | Share link to approved application form | Ava | High | TBD |
| W3 | Confirm fiscal-sponsor language | Ava | Med | TBD |
| W4 | Permissioned local body photos | Ava | Med | TBD |
| W5 | Early supporter list | Ava | Med | TBD |
| W7 | OG social card | David | Low | Pre-launch |
| F1 | Build /feedback page | David | High | This week |
| F2 | Confirm Softr feedback form URL | David | High | This week |
| F4 | Add per-section "Suggest edit" buttons | David | High | This week |
| A1 | Stand up Softr workspace | David | High | This week |
| A2 | Invite client team to Admin user group | Ava | High | This week |
| A4 | Build /admin page on Netlify | David | Med | Post-launch |
| M1 | Wire Web3Forms mailing list → Airtable | David | Med | Pre-launch |
| M2 | Add mailing-list signup to footer + Three Asks | David | Med | Pre-launch |
| INF1 | Add `AIRTABLE_BASE_ID` + `AIRTABLE_PAT` to Netlify env vars | David | Med | Once base is built |

---

## 8b · Airtable + secrets

**Base**: [`appAWSOlM2P9kqgOV`](https://airtable.com/appAWSOlM2P9kqgOV)

**Two PATs, two scopes — recommended split**

| PAT | Scope | Lives in | Used for |
|---|---|---|---|
| `AIRTABLE_PAT_WRITE` | `data.records:read`, `data.records:write` on this base only | Netlify env vars | Server-side writes from Netlify Functions: contact form → Contacts, "Suggest edit" → Feedback, etc. |
| `AIRTABLE_PAT_READ` | `data.records:read` on this base only | `.env.local` in repo (gitignored) | Local sessions: pull tasks, screenshots, and feedback so Claude can act on them between commits |

**Netlify side** — when you've created the write PAT:
```
Netlify → Site configuration → Environment variables
  AIRTABLE_BASE_ID  = appAWSOlM2P9kqgOV
  AIRTABLE_PAT_WRITE = pat••••••••••••
```
A Netlify Function will read these and post to the Airtable REST API.

**Local side** — drop a `.env.local` at the repo root:
```bash
# .env.local (gitignored)
AIRTABLE_BASE_ID=appAWSOlM2P9kqgOV
AIRTABLE_PAT_READ=pat••••••••••••
```
That lets a session pull the latest Workplan rows, fetch attached screenshots, and mirror new Feedback entries into action items without you having to paste them into chat.

Suggested helper: `scripts/airtable-pull.sh` (TBD) — `source .env.local && curl https://api.airtable.com/v0/$AIRTABLE_BASE_ID/Workplan ...` to dump open tasks as JSON for review at the start of a session.

---

## 8c · Schema drift CI (adapted from `IntegralEd/workbase`)

A two-script + one-workflow pattern catches the moment Airtable diverges from what the code expects.

```
scripts/sync-schema.mjs     pulls live schema → docs/schema.generated.{json,csv}
scripts/verify-schema.mjs   re-syncs in CI, fails on git diff
.github/workflows/schema-drift.yml   runs verify on every PR + push to main
```

**One-time setup**
1. Add GitHub repo secret `AIRTABLE_PAT_READ` (PAT with `schema.bases:read` on this base)
2. (Optional) Add repo variable `AIRTABLE_BASE_ID` if you ever fork to a different base
3. Once the initial base config is finished, run `npm run schema:sync` locally and commit `docs/schema.generated.{json,csv}` — that snapshot is the baseline

**Day-to-day**
- Field renamed, table added, type changed in Airtable? → CI fails on the next PR with a colored diff
- Change is intentional? → `npm run schema:sync` locally, commit the updated snapshot, CI passes
- Bootstrap mode: until the first snapshot is committed, the workflow runs but cleanly no-ops

**Optional safety net**: list table IDs in `REQUIRED_TABLE_IDS` inside `sync-schema.mjs` and the sync fails loudly if any are deleted/recreated. (Names rename freely; IDs are stable.)

---

## 9 · How this doc stays in sync

- **Source of truth = the Airtable Workplan table.**
- This MD file is the human-readable mirror for skim-reading and embedding.
- A short Softr automation (or weekly manual sync) regenerates section 8 from the Workplan view filtered to "Active".
- Owners can update their own rows in Softr; status flips here on the next sync.

If we want it iframe-ready inside Softr, we add `/plan.html` to the Netlify site — a 30-line renderer that fetches this MD via `fetch('/docs/BUILD_PLAN.md')` and pipes it through a tiny markdown library (e.g. `marked` from a CDN). That gives Softr a clean URL to embed.

---

## 10 · Open questions

- Custom subdomain or path? `nextgensw.org/admin` (Netlify rewrite to Softr) vs. `admin.nextgensw.org` (CNAME). Lean toward the path-based version so all stakeholder URLs share the brand domain.
- Auth on `/feedback` Phase 1 — gate with `?admin=1` query token, or leave fully open during early review window? (Default: open, switch to gated after launch.)
- Donation flow — keep Jotform, or move into Softr too once admin pane is live? Jotform's payment integration is mature; not worth changing pre-launch.
- Application form rollout date drives W2 — can we get an indicative date from Ava?

---

*Last updated: see git log on this file.*
