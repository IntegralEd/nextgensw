#!/usr/bin/env node
/**
 * scripts/sync-announcement.mjs
 *
 * Read the top record from the Airtable Announcement table's
 * `Active_Announcements` view and write it into
 * `assets/data/announcement.json`. The view itself does the filtering:
 *
 *   Status = Published
 *   AND ( Deadline_Date is on or after today
 *         OR Ends_At is on or after today )
 *   AND ( Starts_At is on or before today
 *         OR Starts_At is empty )
 *
 * This lets Deadline_Date drive deadline-style announcements (with
 * countdown), Ends_At keep non-deadline announcements (info session,
 * matching gift) alive, and Starts_At stage the next announcement
 * ahead of time without it appearing too early. This script stays
 * dumb: take the first row of whatever the view returns, map fields
 * → JSON keys, write the file.
 *
 * Run paths:
 *   - locally:  `npm run announcement:sync`
 *   - in CI / Netlify build:  added as a prebuild step in netlify.toml
 *
 * Required env (loaded from .env.local then .env if present):
 *   AIRTABLE_BASE_ID
 *   AIRTABLE_PAT_READ    (data.records:read on this base)
 *
 * Exit codes:
 *   0  success — file written, or no change, or active queue empty
 *       (in which case a "visible:false" stub is written so the
 *       banner cleanly disappears once a deadline passes)
 *   1  config / env / IO error
 *   2  Airtable API error
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const TABLE = 'Announcement';
const VIEW = 'Active_Announcements';
const OUT_PATH = resolve(repoRoot, 'assets/data/announcement.json');

// ──────────────────────────────────────────────────────────────────
// dotenv loader (same shape as the other scripts)
// ──────────────────────────────────────────────────────────────────
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
function pickEnv(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  return undefined;
}

loadDotEnv(resolve(repoRoot, '.env.local'));
loadDotEnv(resolve(repoRoot, '.env'));

// ──────────────────────────────────────────────────────────────────
// Field → JSON-key mapping. Single source of truth: when the
// Airtable schema gains a field that should land in the published
// JSON, add it here. Anything not in this map is dropped, so a
// stray internal field can't leak to the public site.
// ──────────────────────────────────────────────────────────────────
const FIELD_MAP = {
  Version:        ['version',       v => Number(v) || 0],
  Preset:         ['preset',        v => String(v || '')],
  Eyebrow:        ['eyebrow',       v => String(v || '').trim()],
  Headline:       ['headline',      v => String(v || '').trim()],
  Subtext:        ['subtext',       v => String(v || '').trim()],
  Button_Text:    ['buttonText',    v => String(v || '').trim()],
  Anchor:         ['anchor',        v => String(v || '').trim()],
  Deadline_Date:  ['deadlineDate',  v => v ? String(v) : null],
  Show_Countdown: ['showCountdown', v => v === true],
  Show_Banner:    ['showBanner',    v => v === true],
  Show_Modal:     ['showModal',     v => v === true],
  Visible:        ['visible',       v => v === true],
  Starts_At:      ['startsAt',      v => v || null],
  Ends_At:        ['endsAt',        v => v || null],
};

// ──────────────────────────────────────────────────────────────────
// House style: spec §1 says no em dashes in announcement copy
// ──────────────────────────────────────────────────────────────────
function checkNoEmDashes(json) {
  const offenders = [];
  for (const [k, v] of Object.entries(json)) {
    if (typeof v === 'string' && v.includes('—')) offenders.push(k);
  }
  if (offenders.length) {
    console.warn(
      `WARN: em dash found in ${offenders.join(', ')} — spec §1 says ` +
      'announcement copy uses no em dashes. Fix the record in Airtable.'
    );
  }
}

// ──────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────
async function main() {
  const baseId = pickEnv('AIRTABLE_BASE_ID');
  const pat = pickEnv('AIRTABLE_PAT_READ', 'AIRTABLE_PAT_SCHEMA');
  if (!baseId) {
    console.error('Missing AIRTABLE_BASE_ID.');
    process.exit(1);
  }
  if (!pat) {
    console.error('Missing AIRTABLE_PAT_READ (or AIRTABLE_PAT_SCHEMA).');
    process.exit(1);
  }

  const url = new URL(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(TABLE)}`
  );
  url.searchParams.set('view', VIEW);
  url.searchParams.set('maxRecords', '1');

  let res;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
  } catch (err) {
    console.error(`Network error: ${err.message}`);
    process.exit(2);
  }
  if (!res.ok) {
    const body = await res.text();
    console.error(`Airtable ${res.status}: ${body.slice(0, 400)}`);
    process.exit(2);
  }
  const data = await res.json();
  const records = data.records || [];

  if (!records.length) {
    // No active record (post-deadline, all archived, or just nothing
    // Published). Write a stub so announcement.js bails out cleanly.
    const stub = {
      version: 0,
      preset: null,
      eyebrow: '',
      headline: '',
      subtext: '',
      buttonText: '',
      anchor: '',
      deadlineDate: null,
      showCountdown: false,
      showBanner: false,
      showModal: false,
      visible: false,
      startsAt: null,
      endsAt: null,
    };
    const out = JSON.stringify(stub, null, 2) + '\n';
    writeFileSync(OUT_PATH, out);
    console.log(
      `Announcement sync: no active record — wrote visible:false stub to ${OUT_PATH}.`
    );
    return;
  }

  const rec = records[0];
  const fields = rec.fields || {};

  // Build the published JSON in stable key order so diffs stay clean
  const json = {};
  for (const [airtableField, [jsonKey, cast]] of Object.entries(FIELD_MAP)) {
    json[jsonKey] = cast(fields[airtableField]);
  }
  // Schema sentinels first, in the same order announcement.js reads them
  const ordered = {
    version:       json.version,
    preset:        json.preset,
    eyebrow:       json.eyebrow,
    headline:      json.headline,
    subtext:       json.subtext,
    buttonText:    json.buttonText,
    anchor:        json.anchor,
    deadlineDate:  json.deadlineDate,
    showCountdown: json.showCountdown,
    showBanner:    json.showBanner,
    showModal:     json.showModal,
    visible:       json.visible,
    startsAt:      json.startsAt,
    endsAt:        json.endsAt,
  };

  checkNoEmDashes(ordered);

  const out = JSON.stringify(ordered, null, 2) + '\n';

  let prev = null;
  try {
    prev = readFileSync(OUT_PATH, 'utf8');
  } catch { /* first run */ }

  if (prev === out) {
    console.log(`Announcement sync: no change (record ${rec.id}, v${ordered.version}).`);
    return;
  }
  writeFileSync(OUT_PATH, out);
  console.log(
    `Announcement sync: wrote v${ordered.version} from record ${rec.id} → ${OUT_PATH}`
  );
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
