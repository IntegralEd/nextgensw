// netlify/functions/events.mjs
//
// Program events (schema §7): cohort sessions, field visits, employer
// events… An event carries agenda/materials, tracks attendance, and
// hours can be logged against it (Time_Entries.Event).
//
// Visibility (2026-10-15): every event is visible to every workspace
// user — the calendar is shared program-wide. Who can *run* an event:
//   staff        → any event
//   employer     → events hosted by their partner org (Partner_Org)
//
//   GET                → all events, newest first, each with canEdit.
//                        Includes meta for the create form: eventTypes
//                        (staff + employers), cohorts (staff), orgs
//                        (staff: all; employer: their own) — each with a
//                        roster for the attendance picker.
//   POST               → create an event. Staff pick a cohort; an
//                        employer's event is stamped with their org,
//                        defaults to Optional attendance, and pings
//                        staff with a Staff-Only inbox message.
//   PATCH { id, action:'update', fields }       (staff / host org)
//   PATCH { id, action:'attendance', userIds }  (staff / host org)

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

const REC_ID = /^rec[A-Za-z0-9]{14}$/;
const EMPLOYER_DEFAULT_TYPE = 'Partner Event';

function publicEvent(r, users, orgs, ctx) {
  const f = r.fields || {};
  const partnerOrgIds = f['Partner_Org'] || [];
  return {
    id: r.id,
    name: f['Event_Name'] || '(untitled event)',
    type: f['Event_Type'] || null,
    attendanceType: f['Attendance_Type'] || 'Required',
    date: f['Event_Date'] || null,
    startTime: f['Start_Time'] || null,
    endTime: f['End_Time'] || null,
    cohortIds: f['Cohort'] || [],
    partnerOrgIds,
    hostOrgs: partnerOrgIds.map((id) => orgs[id]?.name || '?'),
    locationFormat: f['Location_Format'] || null,
    location: f['Location'] || null,
    agenda: f['Agenda'] || '',
    materialsUrl: f['Materials_URL'] || null,
    notes: f['Notes'] || '',
    attendanceIds: f['Attendance'] || [],
    attendance: (f['Attendance'] || []).map((id) => users[id]?.name || '?'),
    followUpTaskIds: f['Follow_Up_Tasks'] || [],
    hoursLogged: (f['Time_Entries'] || []).length,
    canEdit: canEdit(f, ctx),
  };
}

// Staff run everything; an employer runs their org's events.
function canEdit(f, ctx) {
  if (ctx.isStaff) return true;
  if (ctx.role !== 'Employer') return false;
  return (f['Partner_Org'] || []).some((o) => ctx.myOrgs.includes(o));
}

async function fetchOrgs(cfg) {
  const data = await airtableGet(cfg, TABLES.PARTNER_ORGS, { pageSize: '100' });
  const map = {};
  for (const r of data.records || []) {
    map[r.id] = { name: r.fields?.['Name'] || '(org)', memberIds: r.fields?.['Assigned_Interns'] || [] };
  }
  return map;
}

const roster = (ids, users) => ids.filter((id) => users[id]).map((id) => ({ id, name: users[id].name || users[id].email }));

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
  const isEmployer = auth.role === 'Employer';

  try {
    const [users, orgs, meRec] = await Promise.all([
      fetchUserMap(cfg),
      fetchOrgs(cfg),
      airtableGet(cfg, TABLES.USERS, { filterByFormula: `RECORD_ID() = '${auth.uid}'`, maxRecords: '1' }),
    ]);
    const me = meRec.records?.[0]?.fields || {};
    const myOrgs = (me['Partner_Org'] || []).filter((id) => orgs[id]);
    const ctx = { isStaff, role: auth.role, myOrgs };

    if (event.httpMethod === 'GET') {
      const evData = await airtableGet(cfg, TABLES.EVENTS, {
        pageSize: '100',
        'sort[0][field]': 'Event_Date',
        'sort[0][direction]': 'desc',
      });
      const records = evData.records || [];
      const out = { events: records.map((r) => publicEvent(r, users, orgs, ctx)) };

      if (isStaff || isEmployer) {
        const types = new Set(records.map((r) => r.fields?.['Event_Type']).filter(Boolean));
        types.add('Cohort Session');
        types.add(EMPLOYER_DEFAULT_TYPE);
        out.eventTypes = [...types].sort();
        // Orgs the caller may host for — with rosters for attendance.
        const orgIds = isStaff ? Object.keys(orgs) : myOrgs;
        out.orgs = orgIds.map((id) => ({ id, name: orgs[id].name, members: roster(orgs[id].memberIds, users) }));
      }
      if (isStaff) {
        const cohorts = await airtableGet(cfg, TABLES.COHORTS, { pageSize: '100' });
        out.cohorts = (cohorts.records || []).map((c) => ({
          id: c.id,
          name: c.fields?.['Name'] || '?',
          memberIds: c.fields?.['Members'] || [],
          members: roster(c.fields?.['Members'] || [], users),
        }));
      }
      return json(200, origin, out);
    }

    if (!isStaff && !isEmployer) return json(403, origin, { error: 'events are managed by program staff and partner organizations' });
    if (isEmployer && !myOrgs.length) return json(403, origin, { error: 'your account is not linked to a partner organization yet — ask the coordinator' });

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const name = String(b.name || '').trim().slice(0, 200);
      if (!name) return json(400, origin, { error: 'the event needs a name' });
      const fields = { Event_Name: name };
      if (b.type) fields.Event_Type = String(b.type).slice(0, 60);
      if (b.date && /^\d{4}-\d{2}-\d{2}$/.test(b.date)) fields.Event_Date = b.date;
      if (['In-person', 'Virtual', 'Hybrid'].includes(b.locationFormat)) fields.Location_Format = b.locationFormat;
      if (b.location) fields.Location = String(b.location).slice(0, 300);
      if (b.agenda) fields.Agenda = String(b.agenda).slice(0, 5000);
      if (b.materialsUrl) fields.Materials_URL = String(b.materialsUrl).slice(0, 500);

      if (isStaff) {
        if (['Required', 'Optional'].includes(b.attendanceType)) fields.Attendance_Type = b.attendanceType;
        if (b.cohortId && REC_ID.test(b.cohortId)) fields.Cohort = [b.cohortId];
        if (b.orgId && orgs[b.orgId]) fields.Partner_Org = [b.orgId];
      } else {
        // Employer: host org is theirs (client can pick which of theirs
        // when they have several), never a cohort; Optional unless they
        // say Required.
        const orgId = myOrgs.includes(b.orgId) ? b.orgId : myOrgs[0];
        fields.Partner_Org = [orgId];
        fields.Attendance_Type = b.attendanceType === 'Required' ? 'Required' : 'Optional';
        if (!fields.Event_Type) fields.Event_Type = EMPLOYER_DEFAULT_TYPE;
      }

      const res = await airtableWrite(cfg, TABLES.EVENTS, 'POST', [{ fields }]);
      const created = res.records[0];

      // Ping staff: a Staff-Only thread on the new event lands in every
      // coordinator/admin inbox (and the host can see their own post).
      if (isEmployer) {
        const orgName = orgs[fields.Partner_Org[0]]?.name || 'a partner organization';
        const when = [fields.Event_Date, fields.Location_Format, fields.Location].filter(Boolean).join(' · ');
        try {
          await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [{
            fields: {
              Subject: `New partner event: ${name}`,
              Message_Content: `${users[auth.uid]?.name || auth.sub} (${orgName}) added an event — ${fields.Attendance_Type.toLowerCase()} attendance${when ? `, ${when}` : ''}. Open it under Events to review or change the attendance setting.`,
              Author: [auth.uid],
              Event: [created.id],
              Anchor_Record_ID: created.id,
              Visibility: 'Staff Only',
            },
          }]);
        } catch { /* the event exists; a missed ping is not worth a 5xx */ }
      }
      return json(201, origin, { event: publicEvent(created, users, orgs, ctx) });
    }

    if (event.httpMethod === 'PATCH') {
      const b = JSON.parse(event.body || '{}');
      if (!REC_ID.test(String(b.id))) return json(400, origin, { error: 'bad id' });

      // Employers may only touch their org's events.
      if (!isStaff) {
        const cur = await airtableGet(cfg, TABLES.EVENTS, { filterByFormula: `RECORD_ID() = '${b.id}'`, maxRecords: '1' });
        const f = cur.records?.[0]?.fields;
        if (!f || !canEdit(f, ctx)) return json(403, origin, { error: 'only the hosting organization or staff can change this event' });
      }

      if (b.action === 'attendance') {
        const ids = (Array.isArray(b.userIds) ? b.userIds : []).filter((id) => users[id]);
        await airtableWrite(cfg, TABLES.EVENTS, 'PATCH', [{ id: b.id, fields: { Attendance: ids } }]);
        return json(200, origin, { ok: true });
      }

      if (b.action === 'update') {
        const f = b.fields || {};
        const fields = {};
        if (f.name) fields.Event_Name = String(f.name).slice(0, 200);
        if (['Required', 'Optional'].includes(f.attendanceType)) fields.Attendance_Type = f.attendanceType;
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
