// netlify/functions/tasks.mjs
//
// Task workflows for every role. All calls token-authenticated; every
// mutation re-checks the caller's relationship to the task server-side.
//
//   GET ?scope=mine     → tasks assigned to the caller (any logger role)
//   GET ?scope=partner  → employer: tasks for their org's interns (or
//                         that they created), plus meta: assignable
//                         interns + skill areas for the create form.
//                         Staff get all interns as assignable.
//   GET ?scope=all      → staff: every non-archived task
//   POST                → create a task (employer/staff). Server sets
//                         Assigned_By, Partner_Org (creator's org for
//                         employers), Status 'Not Started'.
//   PATCH { id, action, ... }
//     'status'      {status}         intern on own task (the five statuses)
//     'submit-work' {url, note}      intern → Ready for Review + Awaiting Review
//     'review'      {decision, comment} employer/staff on their task:
//                   'accept' → Review_Status Accepted + Status Complete
//                   'request-updates' → Updates Requested + In Progress,
//                   comment required → Messages thread (All Stakeholders)
//     'archive'                      staff only

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

const INTERN_STATUSES = ['Not Started', 'In Progress', 'Blocked / Need Help', 'Ready for Review', 'Complete'];

function publicTask(r, users) {
  const f = r.fields || {};
  const who = (ids) => (ids || []).map((id) => users[id]?.name || '?').join(', ');
  return {
    id: r.id,
    taskId: f['Task_ID'] ?? null,
    name: f['Task_Name'] || '(untitled)',
    description: f['Description'] || '',
    doneLooksLike: f['Done_Looks_Like'] || '',
    assignedTo: who(f['Assigned_To']),
    assignedToIds: f['Assigned_To'] || [],
    assignedBy: who(f['Assigned_By']),
    partnerOrgIds: f['Partner_Org'] || [],
    status: f['Status'] || 'Not Started',
    reviewStatus: f['Review_Status'] || null,
    priority: f['Priority'] || null,
    estHours: f['Est_Hours'] ?? null,
    startDate: f['Start_Date'] || null,
    dueDate: f['Due_Date'] || null,
    links: f['Links'] || null,
    askIfStuck: who(f['Ask_If_Stuck']),
    submittedWorkUrl: f['Submitted_Work_URL'] || null,
    skillAreaIds: f['Skill_Area'] || [],
  };
}

async function scanTasks(cfg, keep) {
  const out = [];
  let offset;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ filterByFormula: `{Status} != 'Archived'`, pageSize: '100' });
    if (offset) qs.set('offset', offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(TABLES.TASKS)}?${qs}`,
      { headers: { Authorization: `Bearer ${cfg.pat}` } }
    );
    if (!res.ok) throw new Error(`tasks: ${res.status}`);
    const data = await res.json();
    for (const r of data.records || []) if (!keep || keep(r)) out.push(r);
    offset = data.offset;
    pages += 1;
  } while (offset && pages < 20);
  return out;
}

async function callerOrgIds(cfg, uid) {
  const data = await airtableGet(cfg, TABLES.USERS, {
    filterByFormula: `RECORD_ID() = '${uid}'`,
    maxRecords: '1',
  });
  return data.records?.[0]?.fields?.['Partner_Org'] || [];
}

function canManage(rec, auth, orgIds) {
  if (STAFF_ROLES.includes(auth.role)) return true;
  const f = rec.fields || {};
  if ((f['Assigned_By'] || []).includes(auth.uid)) return true;
  return (f['Partner_Org'] || []).some((o) => orgIds.includes(o));
}

async function getTask(cfg, id) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(id))) return null;
  const data = await airtableGet(cfg, TABLES.TASKS, {
    filterByFormula: `RECORD_ID() = '${id}'`,
    maxRecords: '1',
  });
  return data.records?.[0] || null;
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
    if (event.httpMethod === 'GET') {
      const scope = event.queryStringParameters?.scope || 'mine';
      const users = await fetchUserMap(cfg);

      if (scope === 'mine') {
        const recs = await scanTasks(cfg, (r) => (r.fields?.['Assigned_To'] || []).includes(auth.uid));
        return json(200, origin, { tasks: recs.map((r) => publicTask(r, users)) });
      }

      if (scope === 'partner') {
        if (!isStaff && auth.role !== 'Employer') return json(403, origin, { error: 'partner view is for employers and staff' });
        const orgIds = isStaff ? null : await callerOrgIds(cfg, auth.uid);
        const recs = await scanTasks(cfg, (r) => {
          if (isStaff) return true;
          const f = r.fields || {};
          return (
            (f['Assigned_By'] || []).includes(auth.uid) ||
            (f['Partner_Org'] || []).some((o) => orgIds.includes(o))
          );
        });
        // assignable interns for the create form
        let internIds;
        if (isStaff) {
          const all = await airtableGet(cfg, TABLES.USERS, {
            filterByFormula: `{User_Role} = 'Intern'`, pageSize: '100',
          });
          internIds = (all.records || []).map((r) => r.id);
        } else {
          internIds = [];
          for (const orgId of orgIds) {
            const org = await airtableGet(cfg, TABLES.PARTNER_ORGS, {
              filterByFormula: `RECORD_ID() = '${orgId}'`, maxRecords: '1',
            });
            internIds.push(...(org.records?.[0]?.fields?.['Assigned_Interns'] || []));
          }
        }
        const skills = await airtableGet(cfg, TABLES.SKILL_AREAS, {
          filterByFormula: `{Active} = TRUE()`, pageSize: '100',
          'sort[0][field]': 'Skill_Name', 'sort[0][direction]': 'asc',
        });
        return json(200, origin, {
          tasks: recs.map((r) => publicTask(r, users)),
          interns: [...new Set(internIds)].map((id) => ({ id, name: users[id]?.name || '?' })),
          skillAreas: (skills.records || []).map((r) => ({ id: r.id, name: r.fields?.['Skill_Name'] || '' })),
        });
      }

      if (scope === 'all') {
        if (!isStaff) return json(403, origin, { error: 'the all-tasks view is staff only' });
        const recs = await scanTasks(cfg, null);
        return json(200, origin, { tasks: recs.map((r) => publicTask(r, users)) });
      }

      return json(400, origin, { error: 'unknown scope' });
    }

    if (event.httpMethod === 'POST') {
      if (!isStaff && auth.role !== 'Employer') return json(403, origin, { error: 'only employers and staff assign tasks' });
      const b = JSON.parse(event.body || '{}');
      const name = String(b.name || '').trim().slice(0, 200);
      const internId = String(b.internId || '');
      if (!name) return json(400, origin, { error: 'the task needs a title' });
      if (!/^rec[A-Za-z0-9]{14}$/.test(internId)) return json(400, origin, { error: 'pick the intern' });

      const orgIds = isStaff ? [] : await callerOrgIds(cfg, auth.uid);
      if (!isStaff) {
        // employer may only assign to interns of their own org
        let allowed = false;
        for (const orgId of orgIds) {
          const org = await airtableGet(cfg, TABLES.PARTNER_ORGS, {
            filterByFormula: `RECORD_ID() = '${orgId}'`, maxRecords: '1',
          });
          if ((org.records?.[0]?.fields?.['Assigned_Interns'] || []).includes(internId)) allowed = true;
        }
        if (!allowed) return json(403, origin, { error: 'that intern is not assigned to your organization' });
      }

      const fields = {
        Task_Name: name,
        Description: String(b.description || '').slice(0, 5000),
        Done_Looks_Like: String(b.doneLooksLike || '').slice(0, 5000),
        Assigned_To: [internId],
        Assigned_By: [auth.uid],
        Status: 'Not Started',
        Ask_If_Stuck: [auth.uid],
      };
      if (!isStaff && orgIds.length) fields.Partner_Org = [orgIds[0]];
      if (b.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(b.dueDate)) fields.Due_Date = b.dueDate;
      if (['Low', 'Medium', 'High'].includes(b.priority)) fields.Priority = b.priority;
      const est = Number(b.estHours);
      if (Number.isFinite(est) && est > 0 && est <= 200) fields.Est_Hours = est;
      if (b.links) fields.Links = String(b.links).slice(0, 500);
      if (/^rec[A-Za-z0-9]{14}$/.test(String(b.skillAreaId || ''))) fields.Skill_Area = [b.skillAreaId];

      const res = await airtableWrite(cfg, TABLES.TASKS, 'POST', [{ fields }]);
      const users = await fetchUserMap(cfg);
      return json(201, origin, { task: publicTask(res.records[0], users) });
    }

    if (event.httpMethod === 'PATCH') {
      const b = JSON.parse(event.body || '{}');
      const rec = await getTask(cfg, b.id);
      if (!rec) return json(404, origin, { error: 'task not found' });
      const mine = (rec.fields?.['Assigned_To'] || []).includes(auth.uid);

      if (b.action === 'status') {
        if (!mine) return json(403, origin, { error: 'only the assigned intern updates task status' });
        if (!INTERN_STATUSES.includes(b.status)) return json(400, origin, { error: 'bad status' });
        await airtableWrite(cfg, TABLES.TASKS, 'PATCH', [{ id: rec.id, fields: { Status: b.status } }]);
        return json(200, origin, { ok: true });
      }

      if (b.action === 'submit-work') {
        if (!mine) return json(403, origin, { error: 'only the assigned intern submits work' });
        const fields = { Status: 'Ready for Review', Review_Status: 'Awaiting Review' };
        if (b.url) fields.Submitted_Work_URL = String(b.url).slice(0, 500);
        await airtableWrite(cfg, TABLES.TASKS, 'PATCH', [{ id: rec.id, fields }]);
        if (b.note) {
          await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [{
            fields: {
              Subject: 'Work submitted',
              Message_Content: String(b.note).slice(0, 2000),
              Author: [auth.uid],
              Task: [rec.id],
              Anchor_Record_ID: rec.id,
              Visibility: 'All Stakeholders',
            },
          }]);
        }
        return json(200, origin, { ok: true });
      }

      if (b.action === 'review') {
        // Interns share an org link with their tasks (their placement),
        // so role must be checked BEFORE org membership — otherwise an
        // intern could accept their own work.
        if (!isStaff && auth.role !== 'Employer') {
          return json(403, origin, { error: 'reviewing is for employers and staff' });
        }
        const orgIds = isStaff ? [] : await callerOrgIds(cfg, auth.uid);
        if (!canManage(rec, auth, orgIds)) return json(403, origin, { error: 'this task is not yours to review' });
        const comment = String(b.comment || '').trim().slice(0, 2000);
        let fields;
        if (b.decision === 'accept') {
          fields = { Review_Status: 'Accepted', Status: 'Complete' };
        } else if (b.decision === 'request-updates') {
          if (!comment) return json(400, origin, { error: 'tell the intern what to update' });
          fields = { Review_Status: 'Updates Requested', Status: 'In Progress' };
        } else {
          return json(400, origin, { error: 'bad decision' });
        }
        await airtableWrite(cfg, TABLES.TASKS, 'PATCH', [{ id: rec.id, fields }]);
        if (comment) {
          await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [{
            fields: {
              Subject: b.decision === 'accept' ? 'Work accepted' : 'Updates requested',
              Message_Content: comment,
              Author: [auth.uid],
              Task: [rec.id],
              Anchor_Record_ID: rec.id,
              Visibility: 'All Stakeholders',
            },
          }]);
        }
        return json(200, origin, { ok: true });
      }

      if (b.action === 'archive') {
        if (!isStaff) return json(403, origin, { error: 'archiving is staff only' });
        await airtableWrite(cfg, TABLES.TASKS, 'PATCH', [{ id: rec.id, fields: { Status: 'Archived' } }]);
        return json(200, origin, { ok: true });
      }

      return json(400, origin, { error: 'unknown action' });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
