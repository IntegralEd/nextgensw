#!/usr/bin/env node
// CI guard: user-facing changes must come with a user-guide update, so
// the guides (which feed the /user-guide Softr page and the helper
// agent) reflect the latest behavior.
//
// Rule: if this PR/branch touches user-facing paths but nothing under
// docs/user-guide/, fail. Escape hatch: put "[skip guides]" in the HEAD
// commit message for genuinely invisible changes (refactors, infra).
//
// Diffs against GUIDES_DIFF_BASE (set by the workflow). Exit 5 on a
// missing guide update.

import { execSync } from 'node:child_process';

const base = process.env.GUIDES_DIFF_BASE;
if (!base) {
  console.log('check-guides-freshness: no GUIDES_DIFF_BASE set — skipping.');
  process.exit(0);
}

// Paths whose changes are user-visible enough to warrant a guide look.
const USER_FACING = [
  /^workspace-app\/src\//,
  /^netlify\/functions\/(?!_lib\/).*\.mjs$/,
  /^index\.html$/,
  /^assets\/(js|css)\//,
];
const GUIDE_RE = /^docs\/user-guide\/.*\.md$/;

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

let changed;
try {
  changed = sh(`git diff --name-only ${base}...HEAD`).split('\n').filter(Boolean);
} catch (e) {
  console.error(`check-guides-freshness: could not diff against ${base}: ${e.message}`);
  process.exit(0); // don't block on diff plumbing issues
}

const headMsg = sh('git log -1 --pretty=%B');
if (/\[skip guides\]/i.test(headMsg)) {
  console.log('check-guides-freshness: "[skip guides]" in HEAD commit — skipping.');
  process.exit(0);
}

const touchedUserFacing = changed.filter((f) => USER_FACING.some((re) => re.test(f)));
const touchedGuides = changed.some((f) => GUIDE_RE.test(f));

if (touchedUserFacing.length && !touchedGuides) {
  console.error('User-facing files changed but no user guide was updated:\n');
  for (const f of touchedUserFacing) console.error(`  ${f}`);
  console.error('\nUpdate the relevant docs/user-guide/*.md so the guides (and the');
  console.error('helper agent) stay current — or add "[skip guides]" to the HEAD');
  console.error('commit message if this change truly has no user-facing effect.');
  process.exit(5);
}

console.log('check-guides-freshness OK.');
