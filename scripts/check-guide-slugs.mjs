#!/usr/bin/env node
// CI guard: the documented site map must match the live panel
// registry. Every panel a user can open should be in the site-map
// guide, and the guide must not reference panels that don't exist.
// Keeps the user guide honest as panels come and go.
//
// Exit 0 = in sync; exit 4 = drift (prints the diff).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = readFileSync(join(root, 'workspace-app/src/panels/index.jsx'), 'utf8');
const siteMap = readFileSync(join(root, 'docs/user-guide/site-map.md'), 'utf8');

// Panel keys: each PANELS entry is `key: { component …` or
// `'kebab-key': { component …`.
const panelKeys = new Set();
for (const m of registry.matchAll(/(?:'([\w-]+)'|([\w-]+)):\s*\{\s*component/g)) {
  panelKeys.add(m[1] || m[2]);
}

// Slugs referenced in the site map: `#/slug`.
const mapKeys = new Set([...siteMap.matchAll(/#\/([\w-]+)/g)].map((m) => m[1]));

const missingFromMap = [...panelKeys].filter((k) => !mapKeys.has(k));
const extraInMap = [...mapKeys].filter((k) => !panelKeys.has(k));

if (!panelKeys.size) {
  console.error('check-guide-slugs: found no panels — parser may be broken.');
  process.exit(4);
}

if (missingFromMap.length || extraInMap.length) {
  console.error('Site map is out of sync with the panel registry.\n');
  if (missingFromMap.length) {
    console.error('Panels missing from docs/user-guide/site-map.md:');
    for (const k of missingFromMap) console.error(`  + #/${k}`);
  }
  if (extraInMap.length) {
    console.error('Slugs in the site map with no matching panel:');
    for (const k of extraInMap) console.error(`  - #/${k}`);
  }
  console.error('\nUpdate docs/user-guide/site-map.md (or the registry) so they match.');
  process.exit(4);
}

console.log(`check-guide-slugs OK: ${panelKeys.size} panels documented in the site map.`);
