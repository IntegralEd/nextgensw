// netlify/functions/cohorts.mjs
//
// Cohort administration (staff only, except read for members). The
// cohort is the program's distro list — members, and cohort-wide task
// fan-out (one Tasks row per intern member, grouped by the Cohort
// link, per schema §2).
//
//   GET  → cohorts the caller can see (staff: all; others: their own),
//          with member names; staff also get the full people list
//   POST { action:'create', name, startDate, endDate }
//   POST { action:'members', id, memberIds, coordinatorId? }
//   POST { action:'status', id, status }
//   POST { action:'fanout', cohortId, name, description, doneLooksLike,
//          dueDate?, estHours?, priority? }
//        → one task per Intern member, Assigned_By = caller

import {
  env,
  TABLES,
  STAFF_ROLES,
  WORKSPACE_ROLES,
  airtableGet,
  airtableWrite,
  fetchUserMap,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

function publicCohort(r, users) {
  const f = r.fields || {};
  return {
    id: r.id,
    name: f['Name'] || '(unnamed cohort)',
    status: f['Status'] || null,
    startDate: f['Start_Date'] || null,
    endDate: f['End_Date'] || null,
    memberIds: f['Members'] || [],
    members: (f['Members'] || []).map((id) => ({
      id, name: users[id]?.name || '?', role: users[id]?.role || null,
    })),
    coordinator: (f['Coordinator'] || []).map((id) => users[id]?.name || '?').join(', '),
    coordinatorIds: f['Coordinator'] || [],
    taskCount: (f['Tasks'] || []).length,
    eventCount: (f['Events'] || []).length,
  };
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
  const isStaff = STAFF_ROLES.includes(auth.role);

  try {
    const users = await fetchUserMap(cfg);
    const data = await airtableGet(cfg, TABLES.COHORTS, { pageSize: '100' });
    const cohorts = data.records || [];

    if (event.httpMethod === 'GET') {
      const visible = cohorts.filter(
        (r) => isStaff || (r.fields?.['Members'] || []).includes(auth.uid)
      );
      const out = { cohorts: visible.map((r) => publicCohort(r, users)) };
      if (isStaff) {
        out.people = Object.entries(users)
          .filter(([, u]) => WORKSPACE_ROLES.includes(u.role))
          .map(([id, u]) => ({ id, name: u.name || u.email, role: u.role }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      return json(200, origin, out);
    }

    if (!isStaff) return json(403, origin, { error: 'cohorts are managed by program staff' });
    if (event.httpMethod !== 'POST') return json(405, origin, { error: 'method not allowed' });
    const b = JSON.parse(event.body || '{}');

    if (b.action === 'create') {
      const name = String(b.name || '').trim().slice(0, 100);
      if (!name) return json(400, origin, { error: 'the cohort needs a name' });
      const fields = { Name: name, Status: 'Planning' };
      if (b.startDate && /^\d{4}-\d{2}-\d{2}$/.test(b.startDate)) fields.Start_Date = b.startDate;
      if (b.endDate && /^\d{4}-\d{2}-\d{2}$/.test(b.endDate)) fields.End_Date = b.endDate;
      const res = await airtableWrite(cfg, TABLES.COHORTS, 'POST', [{ fields }]);
      return json(201, origin, { cohort: publicCohort(res.records[0], users) });
    }

    const rec = cohorts.find((c) => c.id === b.id || c.id === b.cohortId);
    if (!rec) return json(404, origin, { error: 'cohort not found' });

    if (b.action === 'members') {
      const memberIds = (Array.isArray(b.memberIds) ? b.memberIds : []).filter(
        (id) => users[id] && WORKSPACE_ROLES.includes(users[id].role)
      );
      const fields = { Members: memberIds };
      if (b.coordinatorId && users[b.coordinatorId]) fields.Coordinator = [b.coordinatorId];
      await airtableWrite(cfg, TABLES.COHORTS, 'PATCH', [{ id: rec.id, fields }]);
      return json(200, origin, { ok: true });
    }

    if (b.action === 'status') {
      if (!['Planning', 'Active', 'Completed'].includes(b.status)) return json(400, origin, { error: 'bad status' });
      // Program convention: exactly one Active cohort at a time.
      if (b.status === 'Active') {
        const otherActive = cohorts.filter((c) => c.id !== rec.id && c.fields?.['Status'] === 'Active');
        for (const c of otherActive) {
          await airtableWrite(cfg, TABLES.COHORTS, 'PATCH', [{ id: c.id, fields: { Status: 'Completed' } }]);
        }
      }
      await airtableWrite(cfg, TABLES.COHORTS, 'PATCH', [{ id: rec.id, fields: { Status: b.status } }]);
      return json(200, origin, { ok: true });
    }

    if (b.action === 'fanout') {
      const name = String(b.name || '').trim().slice(0, 200);
      if (!name) return json(400, origin, { error: 'the task needs a title' });
      const internMembers = (rec.fields?.['Members'] || []).filter((id) => users[id]?.role === 'Intern');
      if (!internMembers.length) return json(400, origin, { error: 'this cohort has no intern members yet' });
      const base = {
        Task_Name: name,
        Description: String(b.description || '').slice(0, 5000),
        Done_Looks_Like: String(b.doneLooksLike || '').slice(0, 5000),
        Assigned_By: [auth.uid],
        Ask_If_Stuck: [auth.uid],
        Status: 'Not Started',
        Cohort: [rec.id],
      };
      if (b.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) base.Due_Date = b.dueDate;
      if (['Low', 'Medium', 'High'].includes(b.priority)) base.Priority = b.priority;
      if (['15 Minutes', '30 Minutes', '1 Hour', '2 Hours', '4 Hours', '8 hours'].includes(b.estHours)) base.Est_Hours = b.estHours;
      const records = internMembers.map((id) => ({ fields: { ...base, Assigned_To: [id] } }));
      for (let i = 0; i < records.length; i += 10) {
        await airtableWrite(cfg, TABLES.TASKS, 'POST', records.slice(i, i + 10));
      }
      return json(201, origin, { created: records.length });
    }

    return json(400, origin, { error: 'unknown action' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
