# nextgensw.org

Static marketing site for **NextGen SW** — a paid youth internship and mentorship program rooted in Southwest DC. Live at [nextgensw.org](https://nextgensw.org).

> **Project plan + workplan:** [`docs/BUILD_PLAN.md`](docs/BUILD_PLAN.md)
> **Softr custom code reference:** [`Reference/softr.txt`](Reference/softr.txt) and [`Reference/softr-embed.txt`](Reference/softr-embed.txt)

---

## Stack

- Plain HTML / CSS / vanilla JS — **no build step** for the public site
- **Netlify** hosting (auto-deploys on push to `main`); functions in `netlify/functions/*.mjs`
- **Airtable** for forms + feedback (base `appAWSOlM2P9kqgOV`, schema in `docs/schema.generated.json`)
- **Softr** for gated review/admin workspaces (iframes the public site, posts to Airtable)
- Inter via Google Fonts; brand tokens in `assets/css/styles.css`

---

## Repo structure

```
index.html                       single-page site
feedback/index.html              split-screen review wrapper (alt entry to admin flow)
assets/css/styles.css            design tokens + all section styles
assets/js/main.js                modal system, suggest-edit pills, apply form, scroll triggers
assets/img/                      logo, hero, team, motifs
downloads/                       public PDFs (handout, flyer)
netlify.toml                     headers, redirects, functions config
netlify/functions/interest.mjs   POST → Airtable Contact_List (Apply waitlist + future signups)
scripts/sync-schema.mjs          pull Airtable schema → snapshot
scripts/verify-schema.mjs        CI drift check (fails PR on schema mismatch)
.github/workflows/schema-drift.yml  runs verify on every PR
docs/BUILD_PLAN.md               living plan, owners, workplan, schema notes
docs/schema.generated.{json,csv} committed Airtable snapshot (regenerated, never hand-edited)
Reference/softr.txt              copy-paste snippets for Softr custom code blocks
Reference/softr-embed.txt        single-block iframe for the Softr review workspace
.env.local                       gitignored — local-only Airtable read PAT
```

---

## Local preview

Static — open `index.html` directly, or:

```sh
python3 -m http.server 8080
# visit http://localhost:8080
```

To exercise the Apply / Refer notify form locally, point it at the deployed function URL or run `netlify dev` from the Netlify CLI.

---

## Deploy

Pushes to `main` auto-deploy. Cache headers in `netlify.toml`:
- HTML — `max-age=0, must-revalidate` (deploys propagate instantly)
- CSS / JS — `max-age=300, must-revalidate` (5-minute window)
- Images — `max-age=86400`

CSS / JS includes carry a `?v=YYYYMMDDx` cache-buster in `index.html`. Bump it whenever a CSS/JS change needs to break a stubborn cache.

---

## Brand palette

| Role            | Hex       |
| --------------- | --------- |
| Brick Red       | `#D93621` |
| Leaf Green      | `#38A460` |
| Potomac Blue    | `#50AAE1` |
| Smiley Yellow   | `#FED01D` |
| Marble Gray     | `#E7E3E2` |
| Cherry Blossom  | `#F8DDE9` |

---

## Airtable + secrets

**Base:** [`appAWSOlM2P9kqgOV`](https://airtable.com/appAWSOlM2P9kqgOV)

| Variable | Where it lives | Used by |
|---|---|---|
| `AIRTABLE_BASE_ID` | Netlify env, GitHub Actions, `.env.local` | All — non-secret, whitelisted in `SECRETS_SCAN_OMIT_KEYS` |
| `AIRTABLE_PAT_READ` | `.env.local` (gitignored), GitHub repo secret | Local schema sync, schema-drift CI |
| `AIRTABLE_PAT_WRITE` | Netlify env only — **never** committed | `netlify/functions/interest.mjs` |

`.env.local` follows dotenv format. Sample at `env.example` (TODO if needed).

---

## Schema drift CI

Every PR + push to `main` runs `scripts/verify-schema.mjs`, which:

1. Pulls the live Airtable schema via the Meta API
2. Writes `docs/schema.generated.{json,csv}`
3. `git diff`s the snapshot — fails the build (exit 3) if Airtable has drifted from what's committed

When you intentionally change the base (rename a field, add a table, change a select option):

```sh
npm run schema:sync
git add docs/schema.generated.* && git commit -m "Schema sync: <what changed>"
```

That commit becomes the new baseline. Done.

Bootstrap mode: until the first snapshot is committed, verify-schema cleanly no-ops. After the first commit, drift detection is live.

---

## Feedback workflow (calibrated 2026-05)

The site has a CRM-style feedback loop wired through Airtable's `Messages` table. Reviewers go through a gated **Softr workspace**, which iframes the public site with admin pills auto-enabled. Pills open a prefilled Softr form. Submissions land in Airtable. The dev addresses them, replies, marks them resolved.

### How an admin reviewer leaves feedback

1. **Visit** `https://NextGenSW.softr.app/website-review` (gated to admins/superadmins via Softr user groups)
2. **The page iframes** `https://nextgensw.org/` — the public site loads with a small **💬 Suggest edit** pill in the bottom-right of every section (auto-enabled because we detect we're inside an iframe; never visible on direct visits to the public site)
3. **Click a pill** → new tab opens to `https://NextGenSW.softr.app/website-feedback?Section=<id>&URL=<page>`
4. **Fill in the form**, attach a screenshot, submit
5. **Lands in `Messages`** with `Section`, `URL`, `Message_Content`, `Attachment`, `User` (auto from Softr session), `Message_Status: Draft` (set by hidden form field)

### How a dev addresses an item

```sh
# 1. Pull the open queue (read PAT from .env.local)
set -a; source .env.local; set +a
curl -s -G "https://api.airtable.com/v0/$AIRTABLE_BASE_ID/Messages" \
  -H "Authorization: Bearer $AIRTABLE_PAT_READ" \
  --data-urlencode "filterByFormula=AND({Is_Reply}=0, OR({Message_Status}='Draft', {Message_Status}='In Progress'))" \
  --data-urlencode "sort[0][field]=Created_Time" \
  --data-urlencode "sort[0][direction]=desc"

# 2. Reproduce in browser; agree on fix approach with the team
# 3. Implement, commit, push to main; capture the commit hash
# 4. Draft a short reply linking the commit
# 5. Paste reply into the Softr message thread (sets Is_Reply=true,
#    Reply_to_Message=<root>, Message_Status=Draft on the reply)
# 6. Flip the root message's Message_Status → Addressed
```

### Threading display fields

The `Messages` table is shaped for threaded back-and-forth:

| Field | What it does |
|---|---|
| `Reply_to_Message` (link → Messages) | Connects a reply to its parent root message |
| `Is_Reply` (checkbox) | Filter root vs. reply rows |
| `Replies` (rollup) | Live count of replies — useful for inbox badges |
| `Message_Responses` (lookup) | Inline summaries of every reply on a root |
| `Message_Summary` (formula) | One-line preview: `<User> posted <Section> at <time>` |
| `Section_Formula` (formula) | Extracts clean section anchor from the URL |
| `Message_Status` (singleSelect) | Draft · In Progress · Addressed · No Action |

Three Softr views give you full triage:

- **Inbox** — `Is_Reply=false AND Message_Status IN (Draft, In Progress)` → active queue
- **Thread detail** — `Reply_to_Message=<root id>` sorted by `Created_Time` ASC
- **Resolved** — `Message_Status IN (Addressed, No Action)` for audit / history

---

## Forms

### Apply / Refer (waitlist mode, current)

Both Apply CTAs (hero + Three Asks) open `#modal-apply-notify`. Form posts JSON to `/.netlify/functions/interest`, which writes to Airtable `Contact_List` with `Interested_Role: ["Intern/Applicant"]`, `Referral_Source: "Apply CTA — application waitlist"`, `Status: "New"`, `Consent: true`.

**When the live application form is published:** edit a single line at the top of `assets/js/main.js`:

```js
const APPLY_URL = 'https://docs.google.com/forms/d/e/.../viewform';
```

That flips both CTAs from "open the notify-me modal" to "open the live form in a new tab" and auto-removes the "Notify me" pill + coming-soon styling. No HTML edits.

### General "Stay in touch" (future)

Same `interest.mjs` function, different invocation — set `interests` from user-checked boxes (`Donor/Sponsor / Intern/Applicant / Employer / Volunteer / Other`) and `Referral_Source` from a "How did you hear about us?" field. Skeleton in `Reference/softr.txt` Block F.

### Web3Forms

Hidden `WEB3FORMS_ACCESS_KEY` is the path for *email* notifications on form submits. Currently optional — Airtable Automations on `Contact_List`/`Messages` insert can do the same job inside the existing stack.

---

## Adding a new section

1. Add `<section id="my-section" class="section section-mysection">…</section>` to `index.html` between two existing sections
2. Style in `styles.css`
3. The "Suggest edit" pill auto-attaches because `main.js` walks `main section[id]` on iframe-load
4. Optionally seed a row in Airtable's `Sections` table with the same `id` for reporting

---

## TODO (live)

See [`docs/BUILD_PLAN.md` §2](docs/BUILD_PLAN.md) for the current owner list. Highlights:

- [ ] Team headshots (Ava)
- [ ] Live application form URL (Ava → David flips `APPLY_URL`)
- [ ] Permissioned community photos (Rhonda)
- [ ] Early supporter wordmarks (Thelma)
- [ ] OG social card 1200×630 (David)
- [ ] Testimonial pull-quote block (Ava + David)
