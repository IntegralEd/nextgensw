# Workspace Style Guide

The workspace app inherits the public site's design language so panels
feel native to nextgensw.org. Tokens are copied (same values) from
`assets/css/styles.css` into `workspace-app/src/styles.css` — if the
public palette ever changes, change both.

## Palette

| Token | Value | Use |
|---|---|---|
| `--brick` / `--brick-dark` | #D93621 / #B02818 | Primary action buttons, destructive/returned states |
| `--leaf` / `--leaf-dark` | #38A460 / #2A7C48 | Secondary/confirm buttons, approved states |
| `--potomac` / `--potomac-dark` | #50AAE1 / #2E86BD | Focus rings, informational/submitted states |
| `--yellow` | #FED01D | Highlights, sparingly |
| `--pink` | #F8DDE9 | Soft backgrounds, sparingly |
| `--ink` | #1B1B1B | Text, outline buttons |
| `--gray-50/100/200/500` | — | Backgrounds, borders, secondary text |

**Status semantics** (use these, never raw colors, for anything with a
lifecycle): `--status-draft` (gray), `--status-submitted` (potomac),
`--status-approved` (leaf), `--status-returned` (brick). Rendered with
the `.chip` classes: `chip draft|submitted|approved|returned`.

## Type & shape

- Font: Inter with system fallbacks (`--font-sans`), loaded by the
  Softr parent page context; fallbacks carry it elsewhere.
- Radii: `--radius` 14px (cards), `--radius-sm` 8px (inputs); buttons
  are full pills (999px) matching the public site CTAs.
- Shadows: `--shadow-sm` on cards, `--shadow-md` on floating elements
  (toasts).

## Components

- **Buttons**: `.btn` + `btn-primary` (brick), `btn-secondary` (leaf),
  `btn-outline` (ink), `btn-ghost` (quiet), `btn-sm`. Primary = the
  one main action on a screen; don't put two primaries side by side.
- **Cards**: `.card` for grouped content.
- **Tables**: `.data` for lists (wrap in `.table-wrap` so mobile
  scrolls the table, not the page), `.kv` for label/value pairs.
- **Toasts**: `.toast` (+ `.error`) — bottom-center pill, used for
  save confirmations and the pay-period validation blockers.
- **Multi-entry rows**: `.entry-row` grid, collapsing to two columns
  on mobile.

## Rules

1. Mobile-first: every panel must work at 375px wide — interns are on
   phones. Tables scroll inside `.table-wrap`; forms stack.
2. Supportive tone (per Ava's doc): error and empty states explain
   what to do next, never just "error".
3. Status colors only through the `--status-*` tokens so approved is
   always leaf-green everywhere, returned is always brick, etc.
4. White background, minimal chrome — panels live inside a Softr page
   that already has nav and heading; don't duplicate them.
