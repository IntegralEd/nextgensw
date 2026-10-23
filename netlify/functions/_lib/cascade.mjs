// netlify/functions/_lib/cascade.mjs
//
// Deleting a task or event takes its discussion with it: every thread
// anchored to it (Messages.Anchor_Record_ID) and those threads' replies
// (Messages.Thread_Root_ID). Time entries are NOT deleted here — hours
// are payroll records; callers decide (real hours block a delete, test
// hours go with a test item).

import { TABLES, airtableDelete } from './workspace.mjs';
import { scanAll } from './visibility.mjs';

const orIds = (field, ids) => `OR(${ids.map((id) => `{${field}} = '${id}'`).join(', ')})`;

export async function deleteThreadsFor(cfg, anchorIds) {
  if (!anchorIds.length) return 0;
  const roots = await scanAll(cfg, TABLES.MESSAGES, { filterByFormula: orIds('Anchor_Record_ID', anchorIds) });
  if (!roots.length) return 0;
  const rootIds = roots.map((r) => r.id);
  const replies = await scanAll(cfg, TABLES.MESSAGES, { filterByFormula: orIds('Thread_Root_ID', rootIds) });
  // Replies first so no reply is left pointing at a deleted root.
  return (await airtableDelete(cfg, TABLES.MESSAGES, replies.map((r) => r.id)))
    + (await airtableDelete(cfg, TABLES.MESSAGES, rootIds));
}

// Time entries linked to items, split into real and test.
export async function linkedEntries(cfg, entryIds) {
  if (!entryIds.length) return { real: [], test: [] };
  const recs = await scanAll(cfg, TABLES.TIME_ENTRIES, {
    filterByFormula: `OR(${entryIds.map((id) => `RECORD_ID() = '${id}'`).join(', ')})`,
  });
  return {
    real: recs.filter((r) => r.fields?.['Is_Test'] !== true),
    test: recs.filter((r) => r.fields?.['Is_Test'] === true),
  };
}
