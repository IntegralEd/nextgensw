// netlify/functions/reports.mjs
//
// Weekly intern report for coordinators/admins (ticket: "run a report of
// the interns' completed hours/tasks each week to share with program
// supervisors"). One row per intern for a pay-period week:
//   hours submitted / approved, tasks completed (by Completed_At), tasks
//   open / overdue, and required events attended / missed.
//
//   GET ?period=recXXX → { period, rows }   (staff only)

import {
  env,
  TABLES,
  STAFF_ROLES,
  airtableGet,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

async function scanAll(cfg, table, params = {}) {
  const out = [];
  let offset;
  let pages = 0;
  do {
    const qs = new URLSearchParams({ pageSize: '100', ...params });
    if (offset) qs.set('offset', offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(table)}?${qs}`,
      { headers: { Authorization: `Bearer ${cfg.pat}` } }
    );
    if (!res.ok) throw new Error(`${table}: ${res.status}`);
    const data = await res.json();
    out.push(...(data.records || []));
    offset = data.offset;
    pages += 1;
  } while (offset && pages < 30);
  return out;
}

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
  if (!STAFF_ROLES.includes(auth.role)) {
    return json(403, origin, { error: 'reports are a coordinator/admin function' });
  }

  try {
    const periodId = String(event.queryStringParameters?.period || '');
    if (!/^rec[A-Za-z0-9]{14}$/.test(periodId)) return json(400, origin, { error: 'pick a week' });
    const period = (await airtableGet(cfg, TABLES.PAY_PERIOD, {
      filterByFormula: `RECORD_ID() = '${periodId}'`, maxRecords: '1',
    })).records?.[0];
    if (!period) return json(404, origin, { error: 'week not found' });
    const start = period.fields?.['Starting'], end = period.fields?.['Ending'];
    const today = new Date().toISOString().slice(0, 10);

    const [interns, entries, tasks, events] = await Promise.all([
      scanAll(cfg, TABLES.USERS, { filterByFormula: `{User_Role} = 'Intern'` }),
      scanAll(cfg, TABLES.TIME_ENTRIES, {
        filterByFormula: `AND({Status} != 'Draft', {Date_Worked} >= '${start}', {Date_Worked} <= '${end}')`,
      }),
      scanAll(cfg, TABLES.TASKS, { filterByFormula: `{Status} != 'Archived'` }),
      scanAll(cfg, TABLES.EVENTS, {
        filterByFormula: `AND({Attendance_Type} = 'Required', {Event_Date} >= '${start}', {Event_Date} <= '${end}')`,
      }),
    ]);

    const rows = interns.map((u) => {
      const uid = u.id;
      const f = u.fields || {};
      const myCohorts = new Set(f['Cohorts'] || []);
      const mine = entries.filter((e) => (e.fields?.['Intern'] || []).includes(uid));
      const sum = (st) => mine.filter((e) => e.fields?.['Status'] === st)
        .reduce((a, e) => a + (e.fields?.['Minutes'] || 0), 0);
      const myTasks = tasks.filter((t) => (t.fields?.['Assigned_To'] || []).includes(uid));
      const completedThisWeek = myTasks.filter((t) => {
        const c = (t.fields?.['Completed_At'] || '').slice(0, 10);
        return t.fields?.['Status'] === 'Complete' && c >= start && c <= end;
      }).length;
      const open = myTasks.filter((t) => t.fields?.['Status'] !== 'Complete');
      const overdue = open.filter((t) => t.fields?.['Due_Date'] && t.fields['Due_Date'] < today).length;
      const required = events.filter((ev) => (ev.fields?.['Cohort'] || []).some((c) => myCohorts.has(c)));
      const attended = required.filter((ev) => (ev.fields?.['Attendance'] || []).includes(uid)).length;
      return {
        internId: uid,
        name: (f['Full Name'] || f['Email'] || '').trim(),
        hoursSubmitted: Math.round((sum('Submitted') / 60) * 100) / 100,
        hoursApproved: Math.round((sum('Approved') / 60) * 100) / 100,
        tasksCompleted: completedThisWeek,
        tasksOpen: open.length,
        tasksOverdue: overdue,
        requiredAttended: attended,
        requiredMissed: required.length - attended,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return json(200, origin, {
      period: { id: period.id, label: period.fields?.['Label'] || '', starting: start, ending: end },
      rows,
    });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
