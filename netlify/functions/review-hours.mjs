// netlify/functions/review-hours.mjs
//
// The coordinator's timesheet review — a track SEPARATE from payroll.
// Staff only. (Decided 2026-09-30.)
//
//   GET  → all non-draft time entries with intern name, submitted time,
//          payroll Status, Coordinator_Review, and which roles have
//          commented (for the top filters).
//
//   PATCH { action, id | ids, comment? }
//     'review'         → Coordinator_Review = 'Approved' (coordinator
//                        oversight only; does NOT touch payroll Status).
//                        Accepts a single id or an array `ids` (bulk).
//     'comment'        → Coordinator_Review = 'Open Comment' + a Messages
//                        thread on the entry (Program + Intern). Status
//                        untouched, so you can comment on an already-
//                        approved entry.
//     'payroll-approve'→ ADMIN only: Status = 'Approved' + Reviewed_By/At
//                        + pay period resolved. This is the separate
//                        payroll workflow; coordinators don't do it.

import {
  env,
  TABLES,
  STAFF_ROLES,
  airtableGet,
  airtableWrite,
  fetchUserMap,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

const ADMIN_ROLES = ['Admin', 'SuperAdmin', 'Super Admin'];

// Bucket a user's role for the "who commented" filter.
function roleBucket(role) {
  if (role === 'Intern') return 'Intern';
  if (['Employer', 'Sponsor'].includes(role)) return 'Partner';
  if (['Coordinator', ...ADMIN_ROLES].includes(role)) return 'Coordinator';
  return null;
}

// Map entryId -> Set of commenter role-buckets, from Messages anchored
// to those entries.
async function commenterRolesByEntry(cfg, entryIds, users) {
  const byEntry = {};
  for (let i = 0; i < entryIds.length; i += 30) {
    const chunk = entryIds.slice(i, i + 30);
    const or = chunk.map((id) => `{Anchor_Record_ID} = '${id}'`).join(', ');
    const msgs = await airtableGet(cfg, TABLES.MESSAGES, {
      filterByFormula: `OR(${or})`,
      pageSize: '100',
    });
    for (const m of msgs.records || []) {
      const anchor = m.fields?.['Anchor_Record_ID'];
      if (!anchor) continue;
      const authorId = (m.fields?.['Author'] || [])[0];
      const bucket = roleBucket(users[authorId]?.role);
      if (!bucket) continue;
      (byEntry[anchor] ||= new Set()).add(bucket);
    }
  }
  return byEntry;
}

async function resolvePayPeriod(cfg, dateISO) {
  const pp = await airtableGet(cfg, TABLES.PAY_PERIOD, { pageSize: '100' });
  const hit = (pp.records || []).find((p) => {
    const s = p.fields?.['Starting'], e = p.fields?.['Ending'];
    return s && e && dateISO >= s && dateISO <= e;
  });
  return hit?.id || null;
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
  if (!STAFF_ROLES.includes(auth.role)) {
    return json(403, origin, { error: 'review is a coordinator/admin function' });
  }
  const isAdmin = ADMIN_ROLES.includes(auth.role);

  try {
    if (event.httpMethod === 'GET') {
      const [data, users] = await Promise.all([
        airtableGet(cfg, TABLES.TIME_ENTRIES, {
          filterByFormula: `{Status} != 'Draft'`,
          pageSize: '100',
          'sort[0][field]': 'Date_Worked',
          'sort[0][direction]': 'desc',
        }),
        fetchUserMap(cfg),
      ]);
      const records = data.records || [];
      const commenters = await commenterRolesByEntry(cfg, records.map((r) => r.id), users);
      const entries = records.map((r) => {
        const f = r.fields || {};
        return {
          id: r.id,
          internName: users[(f['Intern'] || [])[0]]?.name || '(unknown)',
          date: f['Date_Worked'] || null,
          minutes: f['Minutes'] ?? 0,
          category: f['Work_Category'] || null,
          notes: f['Notes'] || '',
          submittedAt: f['Submitted_At'] || null,
          status: f['Status'] || null, // payroll lifecycle
          coordinatorReview: f['Coordinator_Review'] || 'New',
          commenterRoles: [...(commenters[r.id] || [])],
        };
      });
      return json(200, origin, { entries, isAdmin });
    }

    if (event.httpMethod !== 'PATCH') return json(405, origin, { error: 'method not allowed' });

    const body = JSON.parse(event.body || '{}');
    const action = body.action;
    const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).filter(
      (x) => /^rec[A-Za-z0-9]{14}$/.test(String(x))
    );
    if (!ids.length) return json(400, origin, { error: 'no entries specified' });

    if (action === 'review') {
      // Coordinator oversight only — never touches payroll Status.
      const updates = ids.map((id) => ({ id, fields: {
        Coordinator_Review: 'Approved',
        Reviewed_By: [auth.uid],
        Reviewed_At: new Date().toISOString(),
      } }));
      for (let i = 0; i < updates.length; i += 10) {
        await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', updates.slice(i, i + 10));
      }
      return json(200, origin, { ok: true, count: updates.length });
    }

    if (action === 'comment') {
      if (ids.length !== 1) return json(400, origin, { error: 'comment on one entry at a time' });
      const comment = String(body.comment || '').trim().slice(0, 2000);
      if (!comment) return json(400, origin, { error: 'write what should change or be clarified' });
      await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', [
        { id: ids[0], fields: { Coordinator_Review: 'Open Comment' } },
      ]);
      await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [{
        fields: {
          Subject: 'Comment on your hours',
          Message_Content: comment,
          Author: [auth.uid],
          Time_Entry: [ids[0]],
          Anchor_Record_ID: ids[0],
          Visibility: 'Program + Intern',
        },
      }]);
      return json(200, origin, { ok: true });
    }

    if (action === 'payroll-approve') {
      if (!isAdmin) return json(403, origin, { error: 'payroll approval is an admin function' });
      for (const id of ids) {
        const rec = (await airtableGet(cfg, TABLES.TIME_ENTRIES, {
          filterByFormula: `RECORD_ID() = '${id}'`, maxRecords: '1',
        })).records?.[0];
        if (!rec) continue;
        const fields = { Status: 'Approved', Reviewed_By: [auth.uid], Reviewed_At: new Date().toISOString() };
        if (!(rec.fields?.['Pay_Period'] || []).length && rec.fields?.['Date_Worked']) {
          const pp = await resolvePayPeriod(cfg, rec.fields['Date_Worked']);
          if (pp) fields.Pay_Period = [pp];
        }
        await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', [{ id, fields }]);
      }
      return json(200, origin, { ok: true, count: ids.length });
    }

    return json(400, origin, { error: 'unknown action' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
