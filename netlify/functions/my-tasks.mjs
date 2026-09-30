// netlify/functions/my-tasks.mjs
//
// GET → the caller's open tasks (id + name + status), for the
// "connect this time entry to a task" dropdown. Tasks can be created
// by staff directly in Airtable, so there's no server-written owner
// column to filter on (unlike Time_Entries) — instead we scan the
// non-archived tasks (a few hundred rows at most per term) and match
// the Assigned_To link server-side. Revisit if the table ever grows
// past a few pages.

import {
  env,
  TABLES,
  airtableGet,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'GET') return json(405, origin, { error: 'method not allowed' });

  const cfg = env();
  if (!cfg) return json(500, origin, { error: 'server not configured' });
  const auth = requireAuth(cfg, event);
  if (!auth) return json(401, origin, { error: 'sign in again' });

  try {
    const mine = [];
    let offset;
    let pages = 0;
    do {
      const params = {
        filterByFormula: `{Status} != 'Archived'`,
        pageSize: '100',
        'fields[]': 'Task_Name',
      };
      // fields[] can only appear once via URLSearchParams; build manually
      const qs = new URLSearchParams(params);
      qs.append('fields[]', 'Status');
      qs.append('fields[]', 'Assigned_To');
      qs.append('fields[]', 'Due_Date');
      if (offset) qs.set('offset', offset);
      const res = await fetch(
        `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(TABLES.TASKS)}?${qs}`,
        { headers: { Authorization: `Bearer ${cfg.pat}` } }
      );
      if (!res.ok) throw new Error(`airtable tasks: ${res.status}`);
      const data = await res.json();
      for (const r of data.records || []) {
        if ((r.fields?.['Assigned_To'] || []).includes(auth.uid)) {
          mine.push({
            id: r.id,
            name: r.fields['Task_Name'] || '(untitled task)',
            status: r.fields['Status'] || null,
            dueDate: r.fields['Due_Date'] || null,
          });
        }
      }
      offset = data.offset;
      pages += 1;
    } while (offset && pages < 10);

    // The caller's partner org(s), for the optional org picker on Log
    // hours (interns can be linked to more than one).
    let orgs = [];
    const meRec = (await airtableGet(cfg, TABLES.USERS, {
      filterByFormula: `RECORD_ID() = '${auth.uid}'`, maxRecords: '1',
    })).records?.[0];
    const orgIds = meRec?.fields?.['Partner_Org'] || [];
    if (orgIds.length) {
      const or = orgIds.map((id) => `RECORD_ID() = '${id}'`).join(', ');
      const od = await airtableGet(cfg, TABLES.PARTNER_ORGS, { filterByFormula: `OR(${or})`, pageSize: '100' });
      orgs = (od.records || []).map((r) => ({ id: r.id, name: r.fields?.['Name'] || '(org)' }));
    }

    return json(200, origin, { tasks: mine, orgs });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
