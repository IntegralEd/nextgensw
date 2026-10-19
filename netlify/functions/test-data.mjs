// netlify/functions/test-data.mjs
//
// Test-data housekeeping (2026-10-19, _lib/testdata.mjs).
//
//   GET                    → staff: how many test rows exist, and the
//                            test accounts (name, role, email)
//   POST { action:'clear' } → admins: delete every Is_Test Task,
//                            Time_Entry, Event and Message. The test
//                            accounts, QA cohort and test partner org
//                            stay, so the sandbox is ready for the next
//                            demo; their What's new markers reset so the
//                            card starts fresh.
//
// Only rows stamped Is_Test are touched — the formula filter is the
// whole safety story, so it is NOT built from request input.

import {
  env,
  TABLES,
  STAFF_ROLES,
  airtableWrite,
  airtableDelete,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';
import { scanAll } from './_lib/visibility.mjs';

const ADMIN_ROLES = ['Admin', 'SuperAdmin', 'Super Admin'];
const ONLY_TEST = '{Is_Test}';
const CONTENT = [TABLES.MESSAGES, TABLES.TIME_ENTRIES, TABLES.TASKS, TABLES.EVENTS];

async function testRows(cfg) {
  const out = {};
  for (const t of CONTENT) out[t] = await scanAll(cfg, t, { filterByFormula: ONLY_TEST });
  return out;
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  const cfg = env();
  if (!cfg) return json(500, origin, { error: 'server not configured' });
  const auth = requireAuth(cfg, event);
  if (!auth) return json(401, origin, { error: 'sign in again' });
  if (!STAFF_ROLES.includes(auth.role)) return json(403, origin, { error: 'test data is managed by program staff' });

  try {
    if (event.httpMethod === 'GET') {
      const [rows, accounts] = await Promise.all([testRows(cfg), scanAll(cfg, TABLES.USERS, { filterByFormula: ONLY_TEST })]);
      return json(200, origin, {
        counts: {
          tasks: rows[TABLES.TASKS].length,
          timeEntries: rows[TABLES.TIME_ENTRIES].length,
          events: rows[TABLES.EVENTS].length,
          messages: rows[TABLES.MESSAGES].length,
        },
        accounts: accounts.map((u) => ({
          id: u.id,
          name: (u.fields?.['Full Name'] || '').trim() || u.fields?.['Email'],
          role: u.fields?.['User_Role'] || null,
          email: u.fields?.['Email'] || null,
        })),
        canClear: ADMIN_ROLES.includes(auth.role),
      });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (b.action !== 'clear') return json(400, origin, { error: 'unknown action' });
      if (!ADMIN_ROLES.includes(auth.role)) return json(403, origin, { error: 'clearing test data is an admin function' });
      const rows = await testRows(cfg);
      // Replies before roots, then hours, tasks, events.
      const msgs = rows[TABLES.MESSAGES].sort((a, b2) => Number(Boolean(b2.fields?.['Thread_Root_ID'])) - Number(Boolean(a.fields?.['Thread_Root_ID'])));
      const deleted = {
        messages: await airtableDelete(cfg, TABLES.MESSAGES, msgs.map((r) => r.id)),
        timeEntries: await airtableDelete(cfg, TABLES.TIME_ENTRIES, rows[TABLES.TIME_ENTRIES].map((r) => r.id)),
        tasks: await airtableDelete(cfg, TABLES.TASKS, rows[TABLES.TASKS].map((r) => r.id)),
        events: await airtableDelete(cfg, TABLES.EVENTS, rows[TABLES.EVENTS].map((r) => r.id)),
      };
      const accounts = await scanAll(cfg, TABLES.USERS, { filterByFormula: ONLY_TEST });
      for (let i = 0; i < accounts.length; i += 10) {
        await airtableWrite(cfg, TABLES.USERS, 'PATCH', accounts.slice(i, i + 10).map((u) => ({
          id: u.id, fields: { Whats_New_Seen_At: null, Whats_New_Dismissed: '', Inbox_Last_Checked_At: null },
        })));
      }
      return json(200, origin, { ok: true, deleted });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
