#!/usr/bin/env node
/**
 * scripts/verify-schema.mjs
 *
 * Runs the schema sync then fails if the generated files have drifted from
 * what's committed. Used by CI on every PR. (No drift = silent pass.)
 *
 * Exit codes:
 *   0  no drift (or no committed snapshot yet — bootstrap mode)
 *   1  sync error (missing env, network, missing required table, etc.)
 *   3  drift detected (details printed to stderr)
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const TRACKED = ['docs/schema.generated.json', 'docs/schema.generated.csv'];

const sync = spawnSync(
  process.execPath,
  [resolve(__dirname, 'sync-schema.mjs')],
  { stdio: 'inherit', cwd: repoRoot },
);
if (sync.status !== 0) process.exit(1);

// Bootstrap: if no committed snapshot exists yet, the first sync writes one
// and there's nothing to diff against. Pass cleanly so the workflow can run
// before the initial schema:sync commit happens.
const hasCommittedSnapshot = TRACKED.some((p) => {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', p], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
});
if (!hasCommittedSnapshot) {
  console.log(
    'No committed schema snapshot yet — run `npm run schema:sync` and commit docs/schema.generated.{json,csv} to enable drift detection.',
  );
  process.exit(0);
}

let diff = '';
try {
  diff = execFileSync('git', ['diff', '--', ...TRACKED], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
} catch (err) {
  console.error('git diff failed:', err?.message ?? err);
  process.exit(1);
}

if (diff.trim()) {
  console.error(
    '\nSchema drift detected. Airtable base has changed vs. the committed snapshot:\n',
  );
  console.error(diff);
  console.error(
    '\nIf this change is expected, run `npm run schema:sync` and commit the updated docs/schema.generated.{json,csv}.',
  );
  process.exit(3);
}

console.log('Schema snapshot is up to date.');
