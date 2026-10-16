// netlify/functions/_lib/visibility.mjs
//
// Who may see which message thread. Shared by the inbox (messages.mjs)
// and the What's new card (whats-new.mjs) so the card can never show a
// thread the inbox would hide. Staff read everything (the audit rule).

import { TABLES, STAFF_ROLES, airtableGet } from './workspace.mjs';

export async function scanAll(cfg, table, params = {}) {
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

// Everything the caller relates to, for visibility decisions.
// buildContext is pure so callers that already loaded these tables
// (whats-new) don't scan them twice; callerContext fetches them.
export function buildContext(auth, me, { tasks = [], entries = [], events = [] } = {}) {
  const isStaff = STAFF_ROLES.includes(auth.role);
  const cohortIds = new Set(me['Cohorts'] || []);
  const orgIds = me['Partner_Org'] || [];
  const myTasks = new Map(); // id -> { assignee: bool }
  if (!isStaff) {
    for (const t of tasks) {
      const f = t.fields || {};
      const assignee = (f['Assigned_To'] || []).includes(auth.uid);
      const related =
        assignee ||
        (f['Assigned_By'] || []).includes(auth.uid) ||
        (auth.role === 'Employer' && (f['Partner_Org'] || []).some((o) => orgIds.includes(o)));
      if (related) myTasks.set(t.id, { assignee });
    }
  }
  const myEntries = new Set(
    isStaff ? [] : entries.filter((r) => (r.fields?.['Intern_Record_ID'] || '') === auth.uid).map((r) => r.id)
  );
  // Events are program-wide (every workspace user sees every event,
  // 2026-10-15), so every event's discussion is open to them too.
  const myEvents = new Set(isStaff ? [] : events.map((e) => e.id));
  return { isStaff, cohortIds, orgIds, myTasks, myEntries, myEvents, lastChecked: me['Inbox_Last_Checked_At'] || null };
}

export async function callerContext(cfg, auth) {
  const isStaff = STAFF_ROLES.includes(auth.role);
  const [userRec, tasks, entries, events] = await Promise.all([
    airtableGet(cfg, TABLES.USERS, { filterByFormula: `RECORD_ID() = '${auth.uid}'`, maxRecords: '1' }),
    isStaff ? [] : scanAll(cfg, TABLES.TASKS),
    isStaff ? [] : scanAll(cfg, TABLES.TIME_ENTRIES, { filterByFormula: `{Intern_Record_ID} = '${auth.uid}'` }),
    isStaff ? [] : scanAll(cfg, TABLES.EVENTS),
  ]);
  return buildContext(auth, userRec.records?.[0]?.fields || {}, { tasks, entries, events });
}

export function rootVisible(f, auth, ctx) {
  if (ctx.isStaff) return true; // audit
  if ((f['Author'] || []).includes(auth.uid)) return true;
  if ((f['Participants'] || []).includes(auth.uid)) return true;
  const vis = f['Visibility'] || 'All Stakeholders';
  if (vis === 'Staff Only' || vis === 'Participants Only') return false;
  const [taskId] = f['Task'] || [];
  if (taskId) {
    const rel = ctx.myTasks.get(taskId);
    if (!rel) return false;
    if (vis === 'Program + Intern') return rel.assignee; // employer excluded
    return true;
  }
  const [entryId] = f['Time_Entry'] || [];
  if (entryId) return ctx.myEntries.has(entryId); // owner (staff already returned)
  const [eventId] = f['Event'] || [];
  if (eventId) return ctx.myEvents.has(eventId);
  const [cohortId] = f['Cohort'] || [];
  if (cohortId) return ctx.cohortIds.has(cohortId);
  return false;
}
