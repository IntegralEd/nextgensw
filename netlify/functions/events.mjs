// netlify/functions/events.mjs
//
// Program events (schema §7): cohort sessions, field visits, employer
// events… An event carries agenda/materials, tracks attendance, and
// hours can be logged against it (Time_Entries.Event).
//
//   GET                → events the caller can see (staff: all;
//                        others: their cohort's, ones they attended,
//                        or — employers — their org's), newest first.
//                        Includes meta for the staff create form.
//   POST               → create an event (staff). typecast lets a new
//                        Event_Type option through, so the team can
//                        grow the list from the form.
//   PATCH { id, action:'update', fields } (staff)
//   PATCH { id, action:'attendance', userIds } (staff) — set the list

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

function publicEvent(r, users) {
  const f = r.fields || {};
  return {
    id: r.id,
    name: f['Event_Name'] || '(untitled event)',
    type: f['Event_Type'] || null,
    date: f['Event_Date'] || null,
    startTime: f['Start_Time'] || null,
    endTime: f['End_Time'] || null,
    cohortIds: f['Cohort'] || [],
    partnerOrgIds: f['Partner_Org'] || [],
    locationFormat: f['Location_Format'] || null,
    location: f['Location'] || null,
    agenda: f['Agenda'] || '',
    materialsUrl: f['Materials_URL'] || null,
    notes: f['Notes'] || '',
    attendanceIds: f['Attendance'] || [],
    attendance: (f['Attendance'] || []).map((id) => users[id]?.name || '?'),
    followUpTaskIds: f['Follow_Up_Tasks'] || [],
    hoursLogged: (f['Time_Entries'] || []).length,
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

    if (event.httpMethod === 'GET') {
      const [evData, meRec] = await Promise.all([
        airtableGet(cfg, TABLES.EVENTS, {
          pageSize: '100',
          'sort[0][field]': 'Event_Date',
          'sort[0][direction]': 'desc',
        }),
        airtableGet(cfg, TABLES.USERS, { filterByFormula: `RECORD_ID() = '${auth.uid}'`, maxRecords: '1' }),
      ]);
      const me = meRec.records?.[0]?.fields || {};
      const myCohorts = new Set(me['Cohorts'] || []);
      const myOrgs = me['Partner_Org'] || [];

      const visible = (evData.records || []).filter((r) => {
        if (isStaff) return true;
        const f = r.fields || {};
        return (
          (f['Cohort'] || []).some((c) => myCohorts.has(c)) ||
          (f['Attendance'] || []).includes(auth.uid) ||
          (auth.role === 'Employer' && (f['Partner_Org'] || []).some((o) => myOrgs.includes(o)))
        );
      });

      const out = { events: visible.map((r) => publicEvent(r, users)) };
      if (isStaff) {
        const cohorts = await airtableGet(cfg, TABLES.COHORTS, { pageSize: '100' });
        out.cohorts = (cohorts.records || []).map((c) => ({
          id: c.id,
          name: c.fields?.['Name'] || '?',
          memberIds: c.fields?.['Members'] || [],
        }));
        const types = new Set(visible.map((r) => r.fields?.['Event_Type']).filter(Boolean));
        types.add('Cohort Session');
        out.eventTypes = [...types].sort();
      }
      return json(200, origin, out);
    }

    if (!isStaff) return json(403, origin, { error: 'events are managed by program staff' });

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const name = String(b.name || '').trim().slice(0, 200);
      if (!name) return json(400, origin, { error: 'the event needs a name' });
      const fields = { Event_Name: name };
      if (b.type) fields.Event_Type = String(b.type).slice(0, 60);
      if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) fields.Event_Date = b.date;
      if (b.cohortId && /^rec[A-Za-z0-9]{14}$/.test(b.cohortId)) fields.Cohort = [b.cohortId];
      if (['In-person', 'Virtual', 'Hybrid'].includes(b.locationFormat)) fields.Location_Format = b.locationFormat;
      if (b.location) fields.Location = String(b.location).slice(0, 300);
      if (b.agenda) fields.Agenda = String(b.agenda).slice(0, 5000);
      if (b.materialsUrl) fields.Materials_URL = String(b.materialsUrl).slice(0, 500);
      const res = await airtableWrite(cfg, TABLES.EVENTS, 'POST', [{ fields }]);
      return json(201, origin, { event: publicEvent(res.records[0], users) });
    }

    if (event.httpMethod === 'PATCH') {
      const b = JSON.parse(event.body || '{}');
      if (!/^rec[A-Za-z0-9]{14}$/.test(String(b.id))) return json(400, origin, { error: 'bad id' });

      if (b.action === 'attendance') {
        const ids = (Array.isArray(b.userIds) ? b.userIds : []).filter((id) => users[id]);
        await airtableWrite(cfg, TABLES.EVENTS, 'PATCH', [{ id: b.id, fields: { Attendance: ids } }]);
        return json(200, origin, { ok: true });
      }

      if (b.action === 'update') {
        const f = b.fields || {};
        const fields = {};
        if (f.name) fields.Event_Name = String(f.name).slice(0, 200);
        if (f.agenda !== undefined) fields.Agenda = String(f.agenda).slice(0, 5000);
        if (f.materialsUrl !== undefined) fields.Materials_URL = String(f.materialsUrl).slice(0, 500);
        if (f.notes !== undefined) fields.Notes = String(f.notes).slice(0, 5000);
        if (f.date && /^\d{4}-\d{2}-\d{2}$/.test(f.date)) fields.Event_Date = f.date;
        if (!Object.keys(fields).length) return json(400, origin, { error: 'nothing to update' });
        await airtableWrite(cfg, TABLES.EVENTS, 'PATCH', [{ id: b.id, fields }]);
        return json(200, origin, { ok: true });
      }

      return json(400, origin, { error: 'unknown action' });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
