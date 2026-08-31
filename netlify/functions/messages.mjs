// netlify/functions/messages.mjs
//
// The workspace conversation system (schema §8): one Messages table,
// root messages anchored to exactly one thing — a task, a time entry,
// an event, a cohort, or a set of people (DM/group) — replies linked
// to the root, visibility per thread, staff audit universal.
//
//   GET               → inbox: every thread the caller may see, with
//                       unread flags (vs Users.Inbox_Last_Checked_At).
//                       ?mark=1 also stamps the checked time.
//   GET ?thread=recX  → the full thread (root + replies), if visible
//   POST { action:'thread', content, subject?, participants? | taskId?
//          | timeEntryId? | eventId? | cohortId?, visibility? }
//   POST { action:'reply', threadId, content }
//
// Visibility is enforced HERE, not in the client: the API never
// returns a thread above the caller's audience level. Staff
// (Coordinator/Admin) read everything — the audit rule — and the
// composer UI discloses that.

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

// Everything the caller relates to, for visibility decisions.
async function callerContext(cfg, auth) {
  const isStaff = STAFF_ROLES.includes(auth.role);
  const [userRec, tasks, entries, events] = await Promise.all([
    airtableGet(cfg, TABLES.USERS, { filterByFormula: `RECORD_ID() = '${auth.uid}'`, maxRecords: '1' }),
    isStaff ? [] : scanAll(cfg, TABLES.TASKS),
    isStaff ? [] : scanAll(cfg, TABLES.TIME_ENTRIES, { filterByFormula: `{Intern_Record_ID} = '${auth.uid}'` }),
    isStaff ? [] : scanAll(cfg, TABLES.EVENTS),
  ]);
  const me = userRec.records?.[0]?.fields || {};
  const cohortIds = new Set(me['Cohorts'] || []);
  const orgIds = me['Partner_Org'] || [];
  const myTasks = new Map(); // id -> { assignee: bool }
  for (const t of tasks) {
    const f = t.fields || {};
    const assignee = (f['Assigned_To'] || []).includes(auth.uid);
    const related =
      assignee ||
      (f['Assigned_By'] || []).includes(auth.uid) ||
      (auth.role === 'Employer' && (f['Partner_Org'] || []).some((o) => orgIds.includes(o)));
    if (related) myTasks.set(t.id, { assignee });
  }
  const myEntries = new Set(entries.map((r) => r.id));
  const myEvents = new Set(
    events
      .filter((e) => {
        const f = e.fields || {};
        return (
          (f['Attendance'] || []).includes(auth.uid) ||
          (f['Cohort'] || []).some((c) => cohortIds.has(c))
        );
      })
      .map((e) => e.id)
  );
  return { isStaff, cohortIds, myTasks, myEntries, myEvents, lastChecked: me['Inbox_Last_Checked_At'] || null };
}

function rootVisible(f, auth, ctx) {
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

async function anchorLabels(cfg, roots, users) {
  const need = { task: new Set(), event: new Set(), cohort: new Set(), entry: new Set() };
  for (const r of roots) {
    const f = r.fields || {};
    if (f['Task']?.[0]) need.task.add(f['Task'][0]);
    if (f['Event']?.[0]) need.event.add(f['Event'][0]);
    if (f['Cohort']?.[0]) need.cohort.add(f['Cohort'][0]);
    if (f['Time_Entry']?.[0]) need.entry.add(f['Time_Entry'][0]);
  }
  const byId = {};
  const grab = async (table, ids, label) => {
    if (!ids.size) return;
    const list = [...ids];
    for (let i = 0; i < list.length; i += 30) {
      const or = list.slice(i, i + 30).map((id) => `RECORD_ID() = '${id}'`).join(', ');
      const data = await airtableGet(cfg, table, { filterByFormula: `OR(${or})`, pageSize: '100' });
      for (const rec of data.records || []) byId[rec.id] = label(rec);
    }
  };
  await grab(TABLES.TASKS, need.task, (r) => `Task: ${r.fields?.['Task_Name'] || '?'}`);
  await grab(TABLES.EVENTS, need.event, (r) => `Event: ${r.fields?.['Event_Name'] || '?'}`);
  await grab(TABLES.COHORTS, need.cohort, (r) => `Cohort: ${r.fields?.['Name'] || '?'}`);
  await grab(TABLES.TIME_ENTRIES, need.entry, (r) => {
    const who = (r.fields?.['Intern'] || []).map((id) => users[id]?.name).filter(Boolean).join(', ');
    return `Hours: ${r.fields?.['Date_Worked'] || '?'}${who ? ` (${who})` : ''}`;
  });
  return byId;
}

function publicMessage(r, users) {
  const f = r.fields || {};
  return {
    id: r.id,
    subject: f['Subject'] || '',
    content: f['Message_Content'] || '',
    author: (f['Author'] || []).map((id) => users[id]?.name || '?').join(', '),
    authorIds: f['Author'] || [],
    createdAt: f['Created_Datetime'] || null,
    visibility: f['Visibility'] || null,
    participants: (f['Participants'] || []).map((id) => users[id]?.name || '?'),
    flagForSupervisor: f['Flag_For_Supervisor'] === true,
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

  try {
    const users = await fetchUserMap(cfg);

    if (event.httpMethod === 'GET') {
      const ctx = await callerContext(cfg, auth);
      const roots = (await scanAll(cfg, TABLES.MESSAGES, { filterByFormula: 'NOT({Is_Reply})' }))
        .filter((r) => rootVisible(r.fields || {}, auth, ctx));

      const threadId = event.queryStringParameters?.thread;
      if (threadId) {
        const root = roots.find((r) => r.id === threadId);
        if (!root) return json(404, origin, { error: 'thread not found' });
        const replies = await scanAll(cfg, TABLES.MESSAGES, {
          filterByFormula: `{Thread_Root_ID} = '${threadId}'`,
        });
        replies.sort((a, b) => String(a.fields?.['Created_Datetime']).localeCompare(String(b.fields?.['Created_Datetime'])));
        return json(200, origin, {
          root: publicMessage(root, users),
          replies: replies.map((r) => publicMessage(r, users)),
        });
      }

      const labels = await anchorLabels(cfg, roots, users);
      const threads = roots
        .map((r) => {
          const f = r.fields || {};
          const latest = [f['Created_Datetime'], f['Latest_Reply_Datetime']].filter(Boolean).sort().pop() || null;
          const anchorId = f['Task']?.[0] || f['Event']?.[0] || f['Cohort']?.[0] || f['Time_Entry']?.[0] || null;
          const m = publicMessage(r, users);
          return {
            ...m,
            replyCount: f['Reply_Count'] ?? (f['Replies'] || []).length ?? 0,
            anchorLabel: anchorId ? labels[anchorId] || null : (m.participants.length ? `With: ${m.participants.join(', ')}` : null),
            latestAt: latest,
            unread: Boolean(latest && (!ctx.lastChecked || latest > ctx.lastChecked)),
          };
        })
        .sort((a, b) => String(b.latestAt).localeCompare(String(a.latestAt)));

      if (event.queryStringParameters?.mark === '1') {
        await airtableWrite(cfg, TABLES.USERS, 'PATCH', [
          { id: auth.uid, fields: { Inbox_Last_Checked_At: new Date().toISOString() } },
        ]);
      }

      const people = Object.entries(users)
        .filter(([id, u]) => id !== auth.uid && WORKSPACE_ROLES.includes(u.role))
        .map(([id, u]) => ({ id, name: u.name || u.email, role: u.role }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return json(200, origin, { threads, people, lastChecked: ctx.lastChecked });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const content = String(b.content || '').trim().slice(0, 5000);
      if (!content) return json(400, origin, { error: 'write a message first' });

      if (b.action === 'reply') {
        const ctx = await callerContext(cfg, auth);
        const rootData = await airtableGet(cfg, TABLES.MESSAGES, {
          filterByFormula: `RECORD_ID() = '${String(b.threadId)}'`, maxRecords: '1',
        });
        const root = rootData.records?.[0];
        if (!root || !rootVisible(root.fields || {}, auth, ctx)) {
          return json(404, origin, { error: 'thread not found' });
        }
        const res = await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [{
          fields: {
            Message_Content: content,
            Author: [auth.uid],
            Reply_to_Message: [root.id],
            Thread_Root_ID: root.id,
          },
        }]);
        return json(201, origin, { message: publicMessage(res.records[0], users) });
      }

      if (b.action === 'thread') {
        const fields = {
          Subject: String(b.subject || '').trim().slice(0, 200),
          Message_Content: content,
          Author: [auth.uid],
        };
        const isStaff = STAFF_ROLES.includes(auth.role);

        if (Array.isArray(b.participants) && b.participants.length) {
          const valid = b.participants.filter((id) => users[id] && WORKSPACE_ROLES.includes(users[id].role));
          if (!valid.length) return json(400, origin, { error: 'pick at least one person' });
          fields.Participants = [...new Set([auth.uid, ...valid])];
          fields.Visibility = 'Participants Only';
        } else if (b.taskId || b.timeEntryId || b.eventId || b.cohortId) {
          const ctx = await callerContext(cfg, auth);
          let anchorId = null;
          if (b.taskId) {
            if (!ctx.isStaff && !ctx.myTasks.has(String(b.taskId))) return json(403, origin, { error: 'not your task' });
            fields.Task = [String(b.taskId)];
            anchorId = String(b.taskId);
            fields.Visibility = 'All Stakeholders';
          } else if (b.timeEntryId) {
            if (!ctx.isStaff && !ctx.myEntries.has(String(b.timeEntryId))) return json(403, origin, { error: 'not your entry' });
            fields.Time_Entry = [String(b.timeEntryId)];
            anchorId = String(b.timeEntryId);
            fields.Visibility = 'Program + Intern';
          } else if (b.eventId) {
            if (!ctx.isStaff && !ctx.myEvents.has(String(b.eventId))) return json(403, origin, { error: 'not your event' });
            fields.Event = [String(b.eventId)];
            anchorId = String(b.eventId);
            fields.Visibility = 'Cohort';
          } else {
            if (!ctx.isStaff && !ctx.cohortIds.has(String(b.cohortId))) return json(403, origin, { error: 'not your cohort' });
            fields.Cohort = [String(b.cohortId)];
            anchorId = String(b.cohortId);
            fields.Visibility = 'Cohort';
          }
          fields.Anchor_Record_ID = anchorId;
          // explicit visibility override, gated
          const want = String(b.visibility || '');
          const allowed = ['All Stakeholders', 'Cohort', 'Program + Intern', 'Staff Only'];
          if (allowed.includes(want) && (isStaff || want === 'All Stakeholders' || (want === 'Program + Intern' && auth.role === 'Intern'))) {
            fields.Visibility = want;
          }
        } else {
          return json(400, origin, { error: 'a thread needs people or an item to attach to' });
        }

        if (b.flagForSupervisor === true) fields.Flag_For_Supervisor = true;
        const res = await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [{ fields }]);
        return json(201, origin, { message: publicMessage(res.records[0], users) });
      }

      return json(400, origin, { error: 'unknown action' });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
