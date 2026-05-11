#!/usr/bin/env node
/**
 * scripts/post-reply.mjs
 *
 * Post a threaded reply to an Airtable "Messages"-style table and
 * optionally flip the parent row's status field. Designed to be
 * portable across projects — table/field/status conventions live
 * in scripts/reply-config.json; this script stays generic.
 *
 * Usage:
 *   node scripts/post-reply.mjs \
 *     --parent <recId> \
 *     --text "Reply text — supports **markdown**." \
 *     [--text-file path/to/reply.md] \
 *     [--user <recId>] \
 *     [--url <url-to-mirror>] \
 *     [--keep-open]            ← skip flipping parent status
 *     [--config path/to/cfg.json] \
 *     [--json]                 ← machine-readable output
 *     [--dry-run]              ← print payload, don't POST
 *
 * Env (loaded from .env.local then .env if present at repo root):
 *   AIRTABLE_BASE_ID
 *   AIRTABLE_PAT_WRITE
 *
 * Exit codes:
 *   0  success
 *   1  config / env / arg error
 *   2  parent fetch failed (id wrong, no permission)
 *   3  reply post failed
 *   4  parent status update failed (reply was posted)
 *
 * Can also be `import`ed:
 *   import { postReply } from './scripts/post-reply.mjs';
 *   const { reply, parent } = await postReply({ parentId, text, ... });
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

// ──────────────────────────────────────────────────────────────────
// Default config — overridden by scripts/reply-config.json or --config
// ──────────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  table: 'Messages',
  fields: {
    content: 'Message_Content',
    isReply: 'Is_Reply',
    replyTo: 'Reply_to_Message',
    user: 'User',
    url: 'URL',
    status: 'Message_Status',
  },
  status: {
    reply: 'Developer Response',
    resolved: 'Addressed',
  },
  defaults: {
    user: null, // record id to attribute replies to by default
  },
};

// ──────────────────────────────────────────────────────────────────
// dotenv loader + env helpers
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

// ──────────────────────────────────────────────────────────────────
// CLI parsing — minimal long-form flag handler, no deps
// ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    parent: null,
    text: null,
    textFile: null,
    user: null,
    url: null,
    config: null,
    keepOpen: false,
    json: false,
    dryRun: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--parent':    out.parent = next(); break;
      case '--text':      out.text = next(); break;
      case '--text-file': out.textFile = next(); break;
      case '--user':      out.user = next(); break;
      case '--url':       out.url = next(); break;
      case '--config':    out.config = next(); break;
      case '--keep-open': out.keepOpen = true; break;
      case '--json':      out.json = true; break;
      case '--dry-run':   out.dryRun = true; break;
      case '-h':
      case '--help':      out.help = true; break;
      default:
        if (a.startsWith('--')) {
          throw new Error(`Unknown flag: ${a}`);
        }
    }
  }
  return out;
}

function printHelp() {
  process.stderr.write(
`scripts/post-reply.mjs — post a threaded reply to Airtable Messages

Required:
  --parent <recId>       Parent message record id
  --text "..."           Reply text (or use --text-file)
  --text-file <path>     Read reply text from a file (markdown OK)

Optional:
  --user <recId>         Override the default attributed user
  --url <url>            URL to write on the reply (default: mirror parent)
  --keep-open            Don't flip parent status to resolved
  --config <path>        Override path to reply-config.json
  --json                 Machine-readable output (one JSON line)
  --dry-run              Build the payload, print it, but don't POST
  -h, --help             This message

Env:
  AIRTABLE_BASE_ID, AIRTABLE_PAT_WRITE  (loaded from .env.local if present)

Examples:
  node scripts/post-reply.mjs --parent recABC --text "Fixed in 329f54e. Thanks!"
  node scripts/post-reply.mjs --parent recABC --text-file reply.md --keep-open
  npm run reply -- --parent recABC --text "..."
`
  );
}

// ──────────────────────────────────────────────────────────────────
// Config loader — merges default + project file + CLI overrides
// ──────────────────────────────────────────────────────────────────
function deepMerge(base, override) {
  if (!override) return base;
  const out = { ...base };
  for (const [k, v] of Object.entries(override)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = deepMerge(base[k] ?? {}, v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

function loadConfig(explicitPath) {
  const tryPaths = [
    explicitPath,
    resolve(repoRoot, 'scripts/reply-config.json'),
    resolve(repoRoot, '.replyrc.json'),
  ].filter(Boolean);
  for (const p of tryPaths) {
    if (existsSync(p)) {
      try {
        const file = JSON.parse(readFileSync(p, 'utf8'));
        return deepMerge(DEFAULT_CONFIG, file);
      } catch (err) {
        throw new Error(`Could not parse config ${p}: ${err.message}`);
      }
    }
  }
  return DEFAULT_CONFIG;
}

// ──────────────────────────────────────────────────────────────────
// Airtable calls
// ──────────────────────────────────────────────────────────────────
async function airtable(method, baseId, pat, path, body) {
  const url = `https://api.airtable.com/v0/${baseId}/${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`Airtable ${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
    e.status = res.status;
    e.body = json;
    throw e;
  }
  return json;
}

async function fetchRecord(baseId, pat, table, id) {
  return airtable('GET', baseId, pat, `${encodeURIComponent(table)}/${id}`);
}

async function createRecord(baseId, pat, table, fields) {
  return airtable('POST', baseId, pat, encodeURIComponent(table), {
    fields,
    typecast: true,
  });
}

async function updateRecord(baseId, pat, table, id, fields) {
  return airtable('PATCH', baseId, pat, `${encodeURIComponent(table)}/${id}`, {
    fields,
    typecast: true,
  });
}

// ──────────────────────────────────────────────────────────────────
// Core
// ──────────────────────────────────────────────────────────────────
export async function postReply({
  baseId,
  pat,
  parentId,
  text,
  user,
  url,
  config = DEFAULT_CONFIG,
  keepOpen = false,
  dryRun = false,
}) {
  if (!baseId) throw new Error('Missing baseId');
  if (!pat) throw new Error('Missing pat (write-scoped)');
  if (!parentId) throw new Error('Missing parentId');
  if (!text || !text.trim()) throw new Error('Missing reply text');

  // Fetch parent so we can mirror URL by default and surface section
  let parent;
  try {
    parent = await fetchRecord(baseId, pat, config.table, parentId);
  } catch (err) {
    err.stage = 'fetchParent';
    throw err;
  }

  const fields = {
    [config.fields.content]: text,
    [config.fields.isReply]: true,
    [config.fields.replyTo]: [parentId],
    [config.fields.url]: url ?? parent.fields?.[config.fields.url] ?? '',
    [config.fields.status]: config.status.reply,
  };
  const attributedUser = user ?? config.defaults?.user;
  if (attributedUser) {
    fields[config.fields.user] = [attributedUser];
  }

  if (dryRun) {
    return { dryRun: true, parent, payload: { fields } };
  }

  let reply;
  try {
    reply = await createRecord(baseId, pat, config.table, fields);
  } catch (err) {
    err.stage = 'createReply';
    throw err;
  }

  let parentUpdate = null;
  if (!keepOpen) {
    try {
      parentUpdate = await updateRecord(baseId, pat, config.table, parentId, {
        [config.fields.status]: config.status.resolved,
      });
    } catch (err) {
      err.stage = 'updateParent';
      err.replyId = reply.id;
      throw err;
    }
  }

  return { reply, parent, parentUpdate };
}

// ──────────────────────────────────────────────────────────────────
// CLI entrypoint
// ──────────────────────────────────────────────────────────────────
const isCli = import.meta.url === `file://${process.argv[1]}`;
if (isCli) {
  loadDotEnv(resolve(repoRoot, '.env.local'));
  loadDotEnv(resolve(repoRoot, '.env'));

  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n\n`);
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (!args.parent) {
    process.stderr.write('Missing --parent <recId>\n\n');
    printHelp();
    process.exit(1);
  }

  let text = args.text;
  if (!text && args.textFile) {
    try {
      text = readFileSync(resolve(process.cwd(), args.textFile), 'utf8');
    } catch (err) {
      process.stderr.write(`Could not read --text-file: ${err.message}\n`);
      process.exit(1);
    }
  }
  if (!text || !text.trim()) {
    process.stderr.write('Missing --text "..." (or --text-file)\n\n');
    printHelp();
    process.exit(1);
  }

  const baseId = pickEnv('AIRTABLE_BASE_ID');
  const pat = pickEnv('AIRTABLE_PAT_WRITE');
  if (!baseId || !pat) {
    process.stderr.write(
      'Missing AIRTABLE_BASE_ID or AIRTABLE_PAT_WRITE in env (.env.local).\n'
    );
    process.exit(1);
  }

  let config;
  try {
    config = loadConfig(args.config);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }

  try {
    const result = await postReply({
      baseId,
      pat,
      parentId: args.parent,
      text,
      user: args.user,
      url: args.url,
      config,
      keepOpen: args.keepOpen,
      dryRun: args.dryRun,
    });

    if (args.json) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else if (args.dryRun) {
      process.stdout.write(
        `DRY RUN — would POST to ${config.table}:\n` +
        JSON.stringify(result.payload, null, 2) + '\n'
      );
    } else {
      const parentSection =
        result.parent?.fields?.Section_Formula ??
        result.parent?.fields?.Section ?? '(blank)';
      process.stdout.write(
        `✓ Posted reply ${result.reply.id}\n` +
        `  Status:    ${config.status.reply}\n` +
        `  Reply to:  ${args.parent}  (Section: ${parentSection})\n` +
        (result.parentUpdate
          ? `✓ Flipped parent → ${config.status.resolved}\n`
          : `↪ Parent left open (--keep-open)\n`)
      );
    }
    process.exit(0);
  } catch (err) {
    const stage = err.stage ?? 'unknown';
    const exit =
      stage === 'fetchParent'  ? 2
      : stage === 'createReply' ? 3
      : stage === 'updateParent' ? 4
      : 1;
    if (args.json) {
      process.stdout.write(JSON.stringify({
        ok: false,
        stage,
        message: err.message,
        replyId: err.replyId ?? null,
      }) + '\n');
    } else {
      process.stderr.write(`✗ Failed at ${stage}: ${err.message}\n`);
      if (err.replyId) {
        process.stderr.write(
          `  Reply ${err.replyId} was posted; only the parent status update failed.\n` +
          `  Patch manually with:  curl -X PATCH .../${err.replyId.includes('/') ? '' : 'Messages/' + args.parent}\n`
        );
      }
    }
    process.exit(exit);
  }
}
