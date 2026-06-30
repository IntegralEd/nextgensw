# Announcement Banner & Modal — Spec

> Feature spec for the site-wide **Announcement** control: a single editable
> record that renders as a dismissable top banner and/or a first-visit modal.
> Replaces the static "Priority deadline" pill in the hero, which sat directly
> above the yellow Donate button and did not stand out.
>
> Design source: `Deadline Callouts.dc.html` (interactive mock, three presets).
> Target repo: `IntegralEd/nextgensw`. Backend: Airtable base `appAWSOlM2P9kqgOV`.

---

## 1 · Goal

Give the team a CRM-style control point to publish a time-sensitive message
that **draws attention to the application deadline now**, and to **reuse the
same surface later** for other announcements (funding match, employer info
session, next deadline) without touching code.

One record drives every placement. The team edits fields in the admin portal
(Airtable / Softr form, the same pattern as the Feedback loop), the public site
reads the published record, and the banner + modal update together.

**Decisions locked in design review**
- Two placements ship: **dismissable top banner** and **first-visit modal**. No
  hero-panel callout.
- Countdown is shown in **whole days only** (no hours / minutes / seconds).
- Copy is **"Apply by …" for priority consideration**. Never say applications
  "close" — a later deadline is published soon after, and we do not want anyone
  to think the program has stopped accepting applicants.
- House style: **no em dashes** anywhere in announcement copy.

---

## 2 · The Announcement record (data model)

Proposed Airtable table **`Announcement`**, following the base's
`TitleCase_Underscore` field convention. Only one record is "live" at a time
(`Status = Published` + within the active window); the rest are drafts or
archived.

| Field | Type | Example | Notes |
|---|---|---|---|
| `Name` | Single line (primary) | `July 15 priority deadline` | Internal label only, never shown to visitors. |
| `Status` | Single select | `Published` | `Draft` / `Published` / `Archived`. Only `Published` can render. |
| `Preset` | Single select | `Deadline` | `Deadline` / `Funding match` / `Info session`. Seeds default copy + CTA in the form; see §3. |
| `Eyebrow` | Single line | `Priority deadline` | Small uppercase kicker. |
| `Headline` | Single line | `Apply by end of day Wed, July 15` | The main line. Keep under ~48 chars so the banner stays one row on desktop. |
| `Subtext` | Long text | `Submit by this date for priority consideration…` | Shown in the modal only. |
| `Cta_Label` | Single line | `Apply now` | Button text. |
| `Cta_Href` | URL | `#apply` or full URL | Anchor on the page or external form URL. |
| `Deadline_Date` | Date | `2026-07-15` | Drives the countdown. Treated as end-of-day in `America/New_York`. |
| `Show_Countdown` | Checkbox | ✅ | When off, the days pill / chip is hidden. |
| `Show_Banner` | Checkbox | ✅ | Render the top banner. |
| `Show_Modal` | Checkbox | ✅ | Render the first-visit modal. |
| `Visible` | Checkbox | ✅ | Master on/off. Off = nothing renders, regardless of the two above. |
| `Starts_At` | Date/time | optional | Do not render before this. Lets the team stage the next deadline early. |
| `Ends_At` | Date/time | optional | Stop rendering after this (independent of the countdown reaching 0). |
| `Version` | Number / autonumber | `3` | Bump on each publish; used as the dismissal key (see §5). |

### Published JSON contract

The site should fetch a small JSON for the single live record (cached at the
edge / built at deploy, or read live from a lightweight endpoint):

```json
{
  "version": 3,
  "preset": "Deadline",
  "eyebrow": "Priority deadline",
  "headline": "Apply by end of day Wed, July 15",
  "subtext": "Submit by this date for priority consideration. Applications are reviewed on a rolling basis, with more cohort spots opening after.",
  "ctaLabel": "Apply now",
  "ctaHref": "#apply",
  "deadlineDate": "2026-07-15",
  "showCountdown": true,
  "showBanner": true,
  "showModal": true,
  "visible": true,
  "startsAt": null,
  "endsAt": null
}
```

If `visible` is false, or `now` is outside `[startsAt, endsAt]`, the site renders
nothing and skips all DOM injection.

---

## 3 · Presets

`Preset` is a convenience that seeds copy + CTA defaults in the admin form. Any
field can be overridden after picking a preset. Presets do **not** change colors
— every announcement uses the brick + yellow brand treatment.

| Preset | Eyebrow | Headline | CTA | Href | Countdown |
|---|---|---|---|---|---|
| Deadline | Priority deadline | Apply by end of day Wed, July 15 | Apply now | `#apply` | on |
| Funding match | Matching gift, limited time | Every dollar doubled through July 15 | Donate now | `#donate` | on |
| Info session | Employer info session | Meet the team, Tuesday July 15 | Reserve a spot | `#rsvp` | optional |

Subtext defaults (modal):
- **Deadline** — "Submit by this date for priority consideration. Applications are reviewed on a rolling basis, with more cohort spots opening after."
- **Funding match** — "A local sponsor will match all gifts up to $10,000 toward intern stipends."
- **Info session** — "A 30 minute virtual session for partners and mentors, 6:00 to 6:30pm ET."

---

## 4 · Countdown logic

```
days = ceil( (endOfDay(Deadline_Date, "America/New_York") - now) / 86_400_000 )
```

- Display whole days only.
- `days > 1`  →  `"{days} days left"`
- `days === 1`  →  `"1 day left"`
- `days <= 0`  →  `"Last day to apply"` (do not show a negative number; never the word "closed")
- If `Show_Countdown` is off, omit the days chip / pill entirely.
- Re-derive on load and once per minute (a day-grain counter needs nothing finer).

> Copy guardrail: the countdown communicates urgency for **priority review**, not
> a hard cutoff. Pair it with "Apply by" headlines, never "closes" or "last
> chance to apply ever".

---

## 5 · Placement behavior

### 5a · Top banner
- Full-width strip pinned above the site header, on every page.
- Layout: pulsing yellow dot, uppercase eyebrow, headline, days chip (yellow on
  brick), white pill CTA, and a dismiss `×` at the right.
- **Dismissible.** On dismiss, store `ngsw_banner_dismissed = {version}` in
  `localStorage`. Re-show only when `Version` increments (new announcement) so a
  fresh deadline reappears even for returning visitors.
- Banner pushes page content down (no overlap); it is part of normal flow, not
  fixed, unless the team later wants it sticky.

### 5b · First-visit modal
- Centered dialog over a scrim, shown once per visitor per announcement version.
- Contents: logo, eyebrow chip, headline, days pill ("{n} days left to apply"),
  subtext, primary CTA, and a quiet "Maybe later" dismiss + `×`.
- On any dismiss or CTA click, store `ngsw_modal_seen = {version}` in
  `localStorage`. Re-show only when `Version` increments.
- Show after a short delay (≈600ms) on first paint, not before the hero renders.

### 5c · Showing both
If `Show_Banner` and `Show_Modal` are both on, the banner is persistent and the
modal is the one-time greeting. The two dismissal keys are independent: closing
the modal leaves the banner in place.

---

## 6 · Accessibility

- **Banner**: wrap in `role="region"` with `aria-label="Site announcement"`.
  The days chip text should be the human string ("15 days left"), not just a
  number. Dismiss button is a real `<button>` with `aria-label="Dismiss announcement"`.
- **Modal**: `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the
  headline. Trap focus while open, return focus to the trigger/last element on
  close, close on `Esc` and on backdrop click. Reuse the existing modal plumbing
  in `assets/js/main.js`.
- Respect `prefers-reduced-motion`: disable the dot pulse and any modal entrance
  animation.
- Color contrast: white and yellow on brick `#B02818`/`#D93621` already meet AA
  for the sizes used; keep CTA text at 700+ weight.

---

## 7 · Brand tokens (from `assets/css/styles.css`)

| Token | Value | Use |
|---|---|---|
| `--brick` | `#D93621` | Banner gradient end, CTA accents |
| `--brick-dark` | `#B02818` | Banner gradient start, days text |
| `--yellow` | `#FED01D` | Eyebrow, days chip background, pulse dot |
| `--ink` | `#1B1B1B` | Modal headline |
| `--white` | `#FFFFFF` | Banner CTA, modal surface |
| Font | Inter 400/700/800 | Already loaded site-wide |

Modal countdown pill background uses a tint of brick (`#FBEEEC`) with
`--brick-dark` text.

---

## 8 · Integration plan

1. **Airtable** — add the `Announcement` table (§2). Build a Softr form view over
   it for the team (same gated workspace as Feedback), or edit rows directly.
2. **Publish** — expose the single live record as JSON. Options, simplest first:
   - Build-time: a deploy step writes `assets/data/announcement.json` from the
     Airtable API (mirrors how `schema.generated.json` is synced via
     `scripts/sync-schema.mjs`).
   - Runtime: a Netlify function reads the live record on request and caches it.
3. **Site shim** — small module in `assets/js/` that fetches the JSON, checks
   `visible` + window + dismissal keys, then injects the banner and/or modal
   using the markup in §5. Reuse existing modal open/close + focus-trap helpers.
4. **Form control point** — the embedded admin control writes edits straight to
   the `Announcement` row; bump `Version` on publish to re-surface to returning
   visitors.
5. **Remove** the static hero pill (`.hero-deadline` block in `index.html` +
   styles) once the banner is live, or keep it as a no-JS fallback.

---

## 9 · Acceptance criteria

- [ ] Editing `Headline`, `Deadline_Date`, `Cta_Label`, `Cta_Href` in the admin
      updates banner + modal after publish, no code change.
- [ ] Countdown shows whole days; reads "Last day to apply" at 0; never negative.
- [ ] `Visible` off removes all announcement DOM.
- [ ] Banner dismiss persists until `Version` increments.
- [ ] Modal shows once per visitor per version; `Esc` / backdrop / CTA all close it.
- [ ] No em dashes in any rendered copy; no "applications close" phrasing.
- [ ] Reduced-motion users see no pulse/animation.
- [ ] AA contrast on all text.

---

## 10 · Files

| File | Role |
|---|---|
| `Deadline Callouts.dc.html` | Interactive design mock (banner + modal, 3 presets, live tweaks). Reference for layout, copy, and tokens. |
| `docs/ANNOUNCEMENT_BANNER_SPEC.md` | This spec. |
| `assets/data/announcement.json` *(to build)* | Published live record. |
| `assets/js/announcement.js` *(to build)* | Fetch + render shim. |
