// Compiles docs/user-guide/*.md into src/generated/guides.json so the
// user-guide panel can render and search them without a server round
// trip. Runs automatically before dev and build (see package.json).
// WorkBase pattern (workbase scripts/build-guides.mjs), simplified.

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const GUIDES_DIR = join(here, '..', '..', 'docs', 'user-guide');
const OUT_FILE = join(here, '..', 'src', 'generated', 'guides.json');

const guides = readdirSync(GUIDES_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort()
  .map((file) => {
    const content = readFileSync(join(GUIDES_DIR, file), 'utf8');
    const title = (content.match(/^#\s+(.+)$/m) || [])[1] || basename(file, '.md');
    return { slug: basename(file, '.md'), title, content };
  });

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify({ builtAt: new Date().toISOString(), guides }, null, 2));
console.log(`build-guides: ${guides.length} guide(s) → src/generated/guides.json`);
