// netlify/functions/time-entries.mjs
//
// Time entry CRUD for the workspace. Every call requires the signed
// session token from /me; every record touched is verified to belong
// to the caller (the WorkBase tightening — the client's ids are never
// trusted).
//
//   GET             → caller's entries, newest first (limit 100)
//   POST { entries: [{date, minutes, category, taskId?, eventId?, notes?}], submit? }
//                   → create as Draft, or Submitted when submit:true
//   PATCH { id, fields?, action? }
//                   → action 'submit' | 'discard' (delete a Draft),
//                     or edit fields while Draft / Returned
//
// Server owns: the Intern link (from the token), Status transitions,
// Submitted_At, and the Pay_Period link (resolved from Date_Worked —
// null-tolerant while pay periods aren't seeded yet).

import {
  env,
  TABLES,
  airtableGet,
  airtableWrite,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

export const WORK_CATEGORIES = [
  'Partner Task',
  'Partner Meeting',
  'Monday Cohort Meeting',
  'Training / Orientation',
  'Final Project',
  'Field Visit',
  'Independent Learning',
  'Other Approved Work',
];

const EDITABLE_STATUSES = ['Draft', 'Returned for Clarification'];

function publicEntry(r) {
  const f = r.fields || {};
  return {
    id: r.id,
    entryId: f['Timesheet_ID'] ?? null,
    date: f['Date_Worked'] || null,
    minutes: f['Minutes'] ?? 0,
    category: f['Work_Category'] || null,
    taskIds: f['Task'] || [],
    eventIds: f['Event'] || [],
    notes: f['Notes'] || '',
    status: f['Status'] || 'Draft',
    submittedAt: f['Submitted_At'] || null,
    payPeriodIds: f['Pay_Period'] || [],
  };
}

async function resolvePayPeriod(cfg, dateISO) {
  // Small table (one row per program week) — fetch and match in code.
  const data = await airtableGet(cfg, TABLES.PAY_PERIOD, { pageSize: '100' });
  const hit = (data.records || []).find((r) => {
    const s = r.fields?.['Starting'], e = r.fields?.['Ending'];
    return s && e && dateISO >= s && dateISO <= e;
  });
  return hit?.id || null;
}

async function getOwnedEntry(cfg, id, uid) {
  if (!/^rec[A-Za-z0-9]{14}$/.test(String(id))) return null;
  const data = await airtableGet(cfg, TABLES.TIME_ENTRIES, {
    filterByFormula: `RECORD_ID() = '${id}'`,
    maxRecords: '1',
  });
  const rec = data.records?.[0];
  if (!rec) return null;
  return (rec.fields?.['Intern'] || []).includes(uid) ? rec : null;
}

function validateEntry(e) {
  const date = String(e.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'each entry needs a date (YYYY-MM-DD)';
  const minutes = Number(e.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 24 * 60) {
    return 'minutes must be between 1 and 1440';
  }
  if (!WORK_CATEGORIES.includes(e.category)) return 'pick a work category';
  return null;
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
  // Employers see intern hours through review surfaces (later stage),
  // never through the logging endpoints.
  if (!['Intern', 'Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'].includes(auth.role)) {
    return json(403, origin, { error: 'your role does not log hours' });
  }

  try {
    if (event.httpMethod === 'GET') {
      const safeUid = auth.uid.replace(/'/g, '');
      const data = await airtableGet(cfg, TABLES.TIME_ENTRIES, {
        filterByFormula: `{Intern_Record_ID} = '${safeUid}'`,
        pageSize: '100',
        'sort[0][field]': 'Date_Worked',
        'sort[0][direction]': 'desc',
      });
      const entries = (data.records || []).map(publicEntry);

      // Attach the latest clarification note to returned entries so the
      // intern sees WHY it came back (the note lives as a Messages
      // thread anchored to the entry).
      const returned = entries.filter((e) => e.status === 'Returned for Clarification').slice(0, 20);
      if (returned.length) {
        const or = returned.map((e) => `{Anchor_Record_ID} = '${e.id}'`).join(', ');
        const msgs = await airtableGet(cfg, TABLES.MESSAGES, {
          filterByFormula: `OR(${or})`,
          pageSize: '100',
          'sort[0][field]': 'Created_Datetime',
          'sort[0][direction]': 'desc',
        });
        const noteByEntry = {};
        for (const m of msgs.records || []) {
          const anchor = m.fields?.['Anchor_Record_ID'];
          if (anchor && !noteByEntry[anchor]) noteByEntry[anchor] = m.fields?.['Message_Content'] || '';
        }
        for (const e of entries) if (noteByEntry[e.id]) e.reviewNote = noteByEntry[e.id];
      }
      return json(200, origin, { entries });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const entries = Array.isArray(body.entries) ? body.entries.slice(0, 20) : [];
      if (!entries.length) return json(400, origin, { error: 'no entries' });
      for (const e of entries) {
        const problem = validateEntry(e);
        if (problem) return json(400, origin, { error: problem });
      }
      const submit = body.submit === true;
      const records = [];
      for (const e of entries) {
        const fields = {
          Intern: [auth.uid],
          Intern_Record_ID: auth.uid, // server-written; enables owner filtering
          Date_Worked: String(e.date).slice(0, 10),
          Minutes: Math.round(Number(e.minutes)),
          Work_Category: e.category,
          Notes: String(e.notes || '').slice(0, 2000),
          Status: submit ? 'Submitted' : 'Draft',
        };
        if (e.taskId) fields.Task = [String(e.taskId)];
        if (e.eventId) fields.Event = [String(e.eventId)];
        if (submit) {
          fields.Submitted_At = new Date().toISOString();
          const pp = await resolvePayPeriod(cfg, fields.Date_Worked);
          if (pp) fields.Pay_Period = [pp];
        }
        records.push({ fields });
      }
      const out = [];
      for (let i = 0; i < records.length; i += 10) {
        const res = await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'POST', records.slice(i, i + 10));
        out.push(...res.records.map(publicEntry));
      }
      return json(201, origin, { entries: out });
    }

    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      const rec = await getOwnedEntry(cfg, body.id, auth.uid);
      if (!rec) return json(404, origin, { error: 'entry not found' });
      const status = rec.fields?.['Status'] || 'Draft';

      if (body.action === 'discard') {
        if (status !== 'Draft') return json(409, origin, { error: 'only drafts can be discarded' });
        const res = await fetch(
          `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(TABLES.TIME_ENTRIES)}/${rec.id}`,
          { method: 'DELETE', headers: { Authorization: `Bearer ${cfg.patWrite}` } }
        );
        if (!res.ok) throw new Error(`delete: ${res.status}`);
        return json(200, origin, { ok: true });
      }

      if (!EDITABLE_STATUSES.includes(status)) {
        return json(409, origin, { error: `a ${status.toLowerCase()} entry can't be changed` });
      }

      const fields = {};
      const e = body.fields || {};
      if (e.date !== undefined || e.minutes !== undefined || e.category !== undefined) {
        const merged = {
          date: e.date ?? rec.fields['Date_Worked'],
          minutes: e.minutes ?? rec.fields['Minutes'],
          category: e.category ?? rec.fields['Work_Category'],
        };
        const problem = validateEntry(merged);
        if (problem) return json(400, origin, { error: problem });
        fields.Date_Worked = String(merged.date).slice(0, 10);
        fields.Minutes = Math.round(Number(merged.minutes));
        fields.Work_Category = merged.category;
      }
      if (e.notes !== undefined) fields.Notes = String(e.notes).slice(0, 2000);
      if (e.taskId !== undefined) fields.Task = e.taskId ? [String(e.taskId)] : [];
      if (e.eventId !== undefined) fields.Event = e.eventId ? [String(e.eventId)] : [];

      if (body.action === 'submit') {
        fields.Status = 'Submitted';
        fields.Submitted_At = new Date().toISOString();
        const date = fields.Date_Worked || rec.fields['Date_Worked'];
        const pp = date ? await resolvePayPeriod(cfg, date) : null;
        if (pp) fields.Pay_Period = [pp];
      }

      const res = await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', [{ id: rec.id, fields }]);
      return json(200, origin, { entry: publicEntry(res.records[0]) });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
