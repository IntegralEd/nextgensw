#!/usr/bin/env node
/**
 * scripts/sync-schema.mjs
 *
 * Pulls the live Airtable schema via the Meta API and writes a deterministic
 * snapshot to docs/schema.generated.{json,csv}. The committed snapshot + CI
 * drift check (verify-schema.mjs) means we notice the moment a field or table
 * is renamed, deleted, or recreated in Airtable.
 *
 * Required env (any of these names work, checked in order):
 *   AIRTABLE_PAT_READ | AIRTABLE_PAT | AIRTABLE_API_KEY
 *   AIRTABLE_BASE_ID
 *
 * Loads .env.local then .env if present (repo root) so local runs "just work".
 *
 * Pattern adapted from IntegralEd/workbase.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const DEFAULT_BASE_ID = 'appAWSOlM2P9kqgOV'; // NextGen SW

// Table IDs the site or admin pane depends on. Extend this list as runtime
// lookups are added — a missing ID here fails the sync loudly so a
// deletion/recreate can't slip through silently. (Names rename freely;
// IDs are stable.)
const REQUIRED_TABLE_IDS = [];

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

loadDotEnv(resolve(repoRoot, '.env.local'));
loadDotEnv(resolve(repoRoot, '.env'));

function pickEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return undefined;
}

async function fetchSchema(apiKey, baseId) {
  const url = `https://api.airtable.com/v0/meta/bases/${baseId}/tables`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Meta API ${res.status}: ${body}`);
  }
  return res.json();
}

function normalize(schema) {
  const tablesById = new Map(schema.tables.map((t) => [t.id, t]));

  const tables = schema.tables
    .map((t) => ({
      id: t.id,
      name: t.name,
      primaryFieldId: t.primaryFieldId ?? null,
      fields: [...t.fields]
        .map((f) => {
          const linkedTableId = f.options?.linkedTableId ?? null;
          return {
            id: f.id,
            name: f.name,
            type: f.type,
            linkedTableId,
            linkedTableName: linkedTableId
              ? tablesById.get(linkedTableId)?.name ?? null
              : null,
          };
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { tables };
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(normalized) {
  const header = [
    'Table_Name',
    'Table_ID',
    'Field_ID',
    'Field_Name',
    'Field_Type',
    'Is_Linked_Field',
    'Linked_Table_ID',
    'Linked_Table',
  ];
  const rows = [header.join(',')];
  for (const t of normalized.tables) {
    for (const f of t.fields) {
      rows.push(
        [
          t.name,
          t.id,
          f.id,
          f.name,
          f.type,
          f.linkedTableId ? 'checked' : '',
          f.linkedTableId ?? '',
          f.linkedTableName ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return rows.join('\n') + '\n';
}

async function main() {
  const apiKey = pickEnv(
    'AIRTABLE_PAT_READ',
    'AIRTABLE_PAT',
    'AIRTABLE_API_KEY',
  );
  if (!apiKey) {
    console.error(
      'Missing Airtable PAT. Set AIRTABLE_PAT_READ (preferred) or AIRTABLE_PAT / AIRTABLE_API_KEY.',
    );
    process.exit(1);
  }
  const baseId = pickEnv('AIRTABLE_BASE_ID') || DEFAULT_BASE_ID;

  const raw = await fetchSchema(apiKey, baseId);
  const normalized = normalize(raw);

  if (REQUIRED_TABLE_IDS.length) {
    const foundIds = new Set(normalized.tables.map((t) => t.id));
    const missing = REQUIRED_TABLE_IDS.filter((id) => !foundIds.has(id));
    if (missing.length) {
      console.error(
        `Schema sync FAILED: required table IDs not found in base ${baseId}:`,
      );
      for (const id of missing) console.error(`  - ${id}`);
      console.error(
        'Either the base ID is wrong or a table was deleted/recreated.',
      );
      process.exit(2);
    }
  }

  const jsonPath = resolve(repoRoot, 'docs/schema.generated.json');
  const csvPath = resolve(repoRoot, 'docs/schema.generated.csv');

  writeFileSync(
    jsonPath,
    JSON.stringify({ baseId, ...normalized }, null, 2) + '\n',
  );
  writeFileSync(csvPath, toCsv(normalized));

  const totalFields = normalized.tables.reduce(
    (n, t) => n + t.fields.length,
    0,
  );
  console.log(
    `Schema sync OK: ${normalized.tables.length} tables, ${totalFields} fields → docs/schema.generated.{json,csv}`,
  );
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
