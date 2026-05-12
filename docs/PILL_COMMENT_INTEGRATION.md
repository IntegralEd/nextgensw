# Pill-Comment Integration Pattern

A portable spec for adding **per-section "💬 Suggest edit" pills** to any static or static-style site, with feedback flowing into Airtable via a Softr-gated workspace and threaded replies handled programmatically.

Lives in production at [nextgensw.org](https://nextgensw.org) (public) + [NextGenSW.softr.app/website-review](https://NextGenSW.softr.app/website-review) (admin workspace).

> **For new projects:** copy the four code snippets in §3, swap the configurable values in §10, and you have the same review loop in your own site in roughly an hour.

---

## 1 · What you get

- Reviewers visit a **gated Softr workspace** that iframes your public site
- A small **"💬 Suggest edit" pill** auto-appears in the bottom-right of every section (only inside the iframe — never on direct public visits)
- Clicking a pill opens a **prefilled Softr form** in a new tab with `Section` + `URL` set
- The submission lands in an **Airtable Messages table** with author auto-linked from the Softr session, attachments supported, status defaulted to `Draft`
- A **dev-side helper script** (`scripts/post-reply.mjs`) posts threaded replies and flips parent status in one command
- **Five-state status convention** keeps active triage, in-progress, replies, and resolutions distinguishable in views

---

## 2 · Architecture

```
┌────────────────────────────┐         ┌────────────────────────────┐
│  Public site               │         │  Softr workspace           │
│  e.g. yourapp.com          │         │  e.g. yourapp.softr.app    │
│                            │         │                            │
│  Static pages with         │         │  /review-workspace ───────┐│
│  section[id] anchors       │         │   ↑ iframes public site   ││
│  and a small JS shim       │         │                           ││
│  that injects pills        │◀── iframe ─┐                        ││
│  when inIframe() === true  │            │                        ││
│                            │            │                        ││
│  Pill click ──────────────────────────► /feedback-form ──────────┤│
│                            │            │  ?Section=…&URL=…      ││
└────────────────────────────┘            │                        ││
                                          │  Softr "Form to        ││
                                          │  Airtable" block       ││
                                          └────────────┬───────────┘│
                                                       │            │
                                                       ▼            │
                                          ┌────────────────────────┐│
                                          │  Airtable base         ││
                                          │                        ││
                                          │  Messages              ││
                                          │  ├ Section / URL       ││
                                          │  ├ Message_Content     ││
                                          │  ├ Attachment          ││
                                          │  ├ User (auto, Softr)  ││
                                          │  ├ Is_Reply             │
                                          │  ├ Reply_to_Message     │
                                          │  ├ Replies (rollup)     │
                                          │  ├ Section_Formula      │
                                          │  ├ Message_Summary      │
                                          │  ├ Message_Responses    │
                                          │  └ Message_Status       │
                                          └────────────┬───────────┘
                                                       │
                                                       ▼
                                          ┌────────────────────────┐
                                          │  Dev replies via       │
                                          │  npm run reply         │
                                          │  → Developer Response  │
                                          │  → flips parent to     │
                                          │    Addressed           │
                                          └────────────────────────┘
```

Three boundaries, three integrations. Each piece is independently swappable.

---

## 3 · Public-site code (copy-paste)

The public site needs three small additions: a JS shim that injects pills, the CSS for the pill, and the security headers that let Softr iframe you.

### 3a · JS — pill injection + click handler

Drop in your main `<script defer>`:

```js
const FEEDBACK_PAGE_URL = 'https://YOUR-WORKSPACE.softr.app/feedback-form';

function inIframe() {
  try { return window.self !== window.top; } catch (_e) { return true; }
}
function buildFeedbackUrl(section) {
  const url = location.origin + location.pathname + '#' + section;
  return `${FEEDBACK_PAGE_URL}?Section=${encodeURIComponent(section)}&URL=${encodeURIComponent(url)}`;
}

if (inIframe()) {
  document.body.classList.add('is-admin');
  document.querySelectorAll('main section[id]').forEach(sec => {
    if (sec.querySelector('.suggest-edit')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'suggest-edit';
    btn.dataset.section = sec.id;
    btn.setAttribute('aria-label', 'Suggest edit on this section');
    btn.innerHTML = '<span aria-hidden="true">💬</span><span class="se-label">Suggest edit</span>';
    sec.appendChild(btn);
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.suggest-edit');
    if (!b) return;
    e.preventDefault();
    const section = b.dataset.section || '';
    window.open(buildFeedbackUrl(section), '_blank', 'noopener');
  });
}
```

**Key design choices:**

- **`inIframe()` check** — pills only render when loaded inside an iframe. Access control is delegated entirely to whatever gates the parent (Softr user groups in this stack). Direct visits to the public URL get a clean public page.
- **`section[id]` selector** — every section with an `id` attribute automatically gets a pill. No manual data attributes per section.
- **`window.open` (new tab)** — not a modal. An iframe inside the parent's iframe loses Softr's third-party session cookies on most browsers, forcing a login loop. A new tab inherits the existing Softr session.
- **`encodeURIComponent`** on both params so the form's URL prefill survives intact.

### 3b · CSS — pill styling

```css
.is-admin main section[id] { position: relative; }
.is-admin main section[id]:hover {
  outline: 2px dashed rgba(217, 54, 33, 0.35);
  outline-offset: -2px;
}

.suggest-edit {
  position: absolute;
  bottom: 14px; right: 14px;
  z-index: 20;
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.5rem 0.85rem;
  background: rgba(217, 54, 33, 0.95);  /* swap brand colour */
  color: #fff;
  border: 0; border-radius: 999px;
  font: 600 0.78rem/1 var(--font-sans, system-ui, sans-serif);
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  opacity: 0.55;
  transition: opacity 0.15s ease, transform 0.05s ease, background 0.15s ease;
}
.suggest-edit:hover { opacity: 1; background: rgba(176, 40, 24, 0.95); }
.suggest-edit:active { transform: translateY(1px); }
.suggest-edit .se-label { white-space: nowrap; }

@media (max-width: 540px) {
  .suggest-edit { bottom: 10px; right: 10px; padding: 0.4rem 0.6rem; }
  .suggest-edit .se-label { display: none; }  /* show only the emoji */
}
```

### 3c · HTTP headers — let Softr iframe you

In `netlify.toml` (or your host's equivalent):

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Content-Security-Policy = "frame-ancestors 'self' https://*.softr.app https://*.softr.io https://*.softrapp.com"
```

**Do NOT** set `X-Frame-Options: SAMEORIGIN` — it has no allowlist support and will block Softr. `frame-ancestors` is the modern replacement and supports the allowlist above. Anything not on that list is still blocked (anti-clickjacking still works).

### 3d · Section markup convention

Every reviewable section needs an `id`:

```html
<section id="hero">…</section>
<section id="features">…</section>
<section id="pricing">…</section>
```

The `id` value becomes the `Section` field in Airtable, so use short stable slugs (`hero`, `features`, `pricing` — not `our-amazing-feature-section-v2`).

---

## 4 · Airtable schema (Messages table)

Minimal required fields:

| Field | Type | Notes |
|---|---|---|
| `Message_Content` | richText | The feedback text |
| `Section` | singleLineText | Raw section anchor from URL param |
| `URL` | singleLineText | The full landing URL of the form (contains both `Section=` and the source page URL) |
| `Attachment` | multipleAttachments | Screenshots, files |
| `User` | link → Users | Auto-set by Softr from logged-in session |
| `Is_Reply` | checkbox | True on replies, false on root messages |
| `Reply_to_Message` | link → Messages | Self-link from reply → parent |
| `Message_Status` | singleSelect | See §6 |
| `Created_Time` | createdTime | Auto |

Recommended formulas (paste into formula fields):

```
Section_Formula  (singleLineText result):
  SUBSTITUTE(REGEX_EXTRACT({URL}, "Section=[^&]+") & "", "Section=", "")

Message_ID  (singleLineText result):
  RECORD_ID()

Message_Summary  (singleLineText result):
  CONCATENATE({User}, " posted ", {Section_Formula}, " at ",
              DATETIME_FORMAT({Created_Time}, 'MM/DD/YYYY h:mm a'), "\n")
```

Recommended rollup + lookup (for threaded display in Softr lists):

```
Replies  (rollup over "From field: Reply_to_Message"):
  COUNTA(values)
  Roll up field: Message_ID
  Result: number, precision 0

Message_Responses  (lookup over "From field: Reply_to_Message"):
  Lookup field: Message_Summary
```

The `Section` field is what the Softr form populates on submit (if the URL-param prefill is wired). `Section_Formula` is the formula fallback — extracts the same value from the raw landing URL even when the prefill doesn't catch.

---

## 5 · Softr setup

### 5a · The form page (`/feedback-form` or any slug)

1. New page → add a **Form to Airtable** block → target the Messages table
2. Field mapping:

| Form input | Airtable field | Default value |
|---|---|---|
| Hidden | `Section` | `{{URL parameter: Section}}` |
| Hidden | `URL` | `{{URL parameter: URL}}` |
| Visible | `Message_Content` | (user input, rich text) |
| Visible | `Attachment` | (user input, multi-file) |
| Hidden | `User` | `{{Logged-in user}}` |
| Hidden | `Message_Status` | `Draft` ← hardcode this; ensures every incoming row has a triage state |
| Hidden | `Is_Reply` | `false` |

3. After-submit action: redirect to the workspace page (so reviewer drops back into review mode)

### 5b · The workspace page (`/review-workspace` or any slug)

This is where reviewers spend their time. One Custom-Code block:

```html
<style>
  .review-shell {
    height: 100vh; display: flex; flex-direction: column;
    margin: 0; background: #1B1B1B;
  }
  .review-bar {
    flex: 0 0 auto;
    padding: 8px 14px;
    background: #1B1B1B; color: #fff;
    font: 13px/1.4 Inter, system-ui, sans-serif;
  }
  .review-bar a { color: #fff; text-decoration: underline; }
  .review-frame {
    flex: 1 1 auto;
    width: 100%; border: 0; background: #fff; display: block;
  }
</style>
<div class="review-shell">
  <div class="review-bar">
    <strong>Review workspace</strong> — hover any section, click 💬 to comment.
    <a href="https://YOURSITE.com/" target="_blank" rel="noopener">Open site in new tab ↗</a>
  </div>
  <iframe
    class="review-frame"
    src="https://YOURSITE.com/"
    title="Site review"
    allow="clipboard-write"
    loading="lazy"></iframe>
</div>
```

Then gate the page to your `Admin` (or whichever) Softr user group.

---

## 6 · Status convention

| Status | Set by | Means | View it appears in |
|---|---|---|---|
| `Draft` | Softr form hidden field on submit | New incoming feedback, not triaged | Inbox |
| `In Progress` | Admin (manually) | Reviewer is actively working on it | Inbox |
| `Developer Response` | `scripts/post-reply.mjs` (or admin) | Row is a reply we posted | Threaded detail only |
| `Addressed` | `scripts/post-reply.mjs` (or admin) | Root resolved, falls off active queue | Resolved |
| `No Action` | Admin | Closed without change (won't-fix, duplicate, out of scope) | Resolved |

Active queue filter for Softr inbox view:

```
AND({Is_Reply}=0, OR({Message_Status}="Draft", {Message_Status}="In Progress"))
```

Resolved view:

```
OR({Message_Status}="Addressed", {Message_Status}="No Action")
```

Thread detail view (within a root's detail page):

```
{Reply_to_Message}=<current record id>
```

---

## 7 · Dev-side reply helper

Once a fix is in, post a threaded reply + flip parent status in one shell command:

```sh
npm run reply -- --parent recPaWa1K4WK7Rw2u --text "Live in 329f54e. Thanks!"
```

That single command:

1. Fetches the parent record
2. Mirrors the parent's `URL` onto the reply (so `Section_Formula` resolves on the reply too)
3. POSTs the reply with:
   - `Is_Reply: true`
   - `Reply_to_Message: [parent]`
   - `User: [default replying user from config]`
   - `Message_Status: "Developer Response"`
4. PATCHes the parent's `Message_Status` to `"Addressed"`

Skip the resolve step with `--keep-open` (e.g. when posting a clarifying question instead of a fix).

Full flag reference in [`scripts/post-reply.mjs`](../scripts/post-reply.mjs) or `npm run reply -- --help`.

The helper is **fully portable** — see [§10 per-app config swaps](#10--per-app-config-swaps).

---

## 8 · Dev-side queue triage

Pull the active queue with the read PAT — pastes straight into a terminal:

```sh
set -a; source .env.local; set +a
curl -s -G "https://api.airtable.com/v0/$AIRTABLE_BASE_ID/Messages" \
  -H "Authorization: Bearer $AIRTABLE_PAT_READ" \
  --data-urlencode "filterByFormula=AND({Is_Reply}=0, OR({Message_Status}='Draft', {Message_Status}='In Progress'))" \
  --data-urlencode "sort[0][field]=Created_Time" \
  --data-urlencode "sort[0][direction]=desc"
```

Or wrap in your tool of choice — the helper script's `import { postReply }` API lets you build a richer triage loop (auto-pull → propose fix → confirm with human → push → reply) inside other automation.

---

## 9 · End-to-end loop (with timings)

| Step | Tool | Time |
|---|---|---|
| 1. Reviewer hits Softr workspace, clicks pill | Browser | 5s |
| 2. Reviewer fills + submits form, attaches screenshot | Softr form | 30s |
| 3. Record lands in Airtable Messages, `Status=Draft` | Auto | <1s |
| 4. Dev pulls queue with curl | Terminal | 2s |
| 5. Dev reads the comment, reproduces, agrees on fix | Browser + chat | 5–30 min (variable) |
| 6. Dev edits, commits, pushes | Git | 1–5 min |
| 7. Dev runs `npm run reply -- --parent <id> --text "..."` | Terminal | <2s |
| 8. Parent status flips to `Addressed`, reply visible in Softr thread | Auto | <1s |

The structural overhead — steps 1–4, 7, 8 — is under a minute total. The variable cost is reproducing and fixing, which the workflow makes no claim to speed up.

---

## 10 · Per-app config swaps

When porting to a new app, the four things that change:

### a. The Softr form URL (in your public site's JS)

```diff
- const FEEDBACK_PAGE_URL = 'https://NextGenSW.softr.app/website-feedback';
+ const FEEDBACK_PAGE_URL = 'https://yourapp.softr.app/your-form-slug';
```

### b. The brand colour (in CSS)

```diff
- background: rgba(217, 54, 33, 0.95);
+ background: rgba(YOUR-R, YOUR-G, YOUR-B, 0.95);
```

(Two occurrences — pill background + hover.)

### c. The reply-helper config (`scripts/reply-config.json`)

If your Airtable conventions differ, override only the values that change:

```json
{
  "table": "Comments",
  "fields": {
    "content": "Body",
    "status": "State"
  },
  "status": {
    "reply": "Replied",
    "resolved": "Done"
  },
  "defaults": {
    "user": "recXYZ123"
  }
}
```

Unspecified fields inherit from the script's `DEFAULT_CONFIG`. So if you keep the same field naming convention, just override `defaults.user` and the status strings.

### d. The CSP header allowlist

If your Softr workspace is on a custom domain (`admin.yourapp.com`), add it:

```diff
- frame-ancestors 'self' https://*.softr.app https://*.softr.io https://*.softrapp.com
+ frame-ancestors 'self' https://*.softr.app https://admin.yourapp.com
```

---

## 11 · Things this pattern intentionally doesn't do

- **No real auth on the public site.** The pill gate is "are we in an iframe?" — that's it. Access control lives entirely in Softr. If someone embeds your site in their own iframe, they'll see pills but submitting requires the Softr login, so the worst case is a confused stranger.
- **No live preview of replies on the public site.** Comments live in Airtable / Softr; the public site is unaware. If you want resolved-comment annotations to appear publicly, that's a separate read API + render layer.
- **No file uploads bypassing Softr.** The Softr form handles attachments. Posting directly to Airtable via API skips the file UX entirely — for the helper script we only post text replies, never attachments.
- **No modal embed for the form.** Tried, failed (third-party cookies break the embedded Softr session on Safari/Firefox/Chrome-strict). New-tab is the working pattern. If you ever move Softr to a subdomain of the public site, the modal becomes viable.

---

## 12 · File reference

In this repo:

| File | What it is |
|---|---|
| [`assets/js/main.js`](../assets/js/main.js) | Live pill-injection + click handler (search for `Suggest edit`) |
| [`assets/css/styles.css`](../assets/css/styles.css) | Live pill styles (search for `.suggest-edit`) |
| [`netlify.toml`](../netlify.toml) | CSP `frame-ancestors` header |
| [`netlify/functions/interest.mjs`](../netlify/functions/interest.mjs) | Sibling pattern: write-via-function (Contact_List), not Messages |
| [`scripts/post-reply.mjs`](../scripts/post-reply.mjs) | Reply helper |
| [`scripts/reply-config.json`](../scripts/reply-config.json) | NextGen SW–specific conventions |
| [`scripts/sync-schema.mjs`](../scripts/sync-schema.mjs) | Schema drift detection (catches Airtable schema changes in CI) |
| [`Reference/softr.txt`](../Reference/softr.txt) | Softr custom-code snippets (page-view tracking, click tracking, embed wrappers) |
| [`Reference/softr-embed.txt`](../Reference/softr-embed.txt) | Standalone copy of the workspace embed for pasting into Softr |
| [`docs/schema.generated.json`](schema.generated.json) | Current Airtable snapshot (the canonical schema after applying §4 above) |

---

*Pattern designed and shipped on `nextgensw.org`, 2026-04 → 2026-05.*
