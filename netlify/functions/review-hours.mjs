// netlify/functions/review-hours.mjs
//
// The coordinator's review queue. Staff only.
//
//   GET  → entries with Status = Submitted (plus intern names joined
//          server-side), oldest first so the queue drains fairly
//   PATCH { id, action: 'approve' | 'return', comment? }
//        approve → Status Approved, Reviewed_By/At, Pay_Period
//                  resolved if missing
//        return  → Status 'Returned for Clarification' + a Messages
//                  thread on the entry carrying the comment
//                  (Visibility 'Program + Intern' — the employer
//                  doesn't see the clarification conversation)

import {
  env,
  TABLES,
  STAFF_ROLES,
  airtableGet,
  airtableWrite,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

async function userNameMap(cfg) {
  const map = {};
  let offset;
  do {
    const params = { pageSize: '100', 'fields[]': 'Full Name' };
    const qs = new URLSearchParams(params);
    if (offset) qs.set('offset', offset);
    const res = await fetch(
      `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(TABLES.USERS)}?${qs}`,
      { headers: { Authorization: `Bearer ${cfg.pat}` } }
    );
    if (!res.ok) throw new Error(`users: ${res.status}`);
    const data = await res.json();
    for (const r of data.records || []) map[r.id] = (r.fields?.['Full Name'] || '').trim();
    offset = data.offset;
  } while (offset);
  return map;
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

  try {
    if (event.httpMethod === 'GET') {
      const [data, names] = await Promise.all([
        airtableGet(cfg, TABLES.TIME_ENTRIES, {
          filterByFormula: `{Status} = 'Submitted'`,
          pageSize: '100',
          'sort[0][field]': 'Submitted_At',
          'sort[0][direction]': 'asc',
        }),
        userNameMap(cfg),
      ]);
      const entries = (data.records || []).map((r) => {
        const f = r.fields || {};
        return {
          id: r.id,
          internName: names[(f['Intern'] || [])[0]] || '(unknown)',
          date: f['Date_Worked'] || null,
          minutes: f['Minutes'] ?? 0,
          category: f['Work_Category'] || null,
          notes: f['Notes'] || '',
          submittedAt: f['Submitted_At'] || null,
        };
      });
      return json(200, origin, { entries });
    }

    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      const { id, action } = body;
      if (!/^rec[A-Za-z0-9]{14}$/.test(String(id))) return json(400, origin, { error: 'bad id' });
      if (!['approve', 'return'].includes(action)) return json(400, origin, { error: 'bad action' });

      const data = await airtableGet(cfg, TABLES.TIME_ENTRIES, {
        filterByFormula: `RECORD_ID() = '${id}'`,
        maxRecords: '1',
      });
      const rec = data.records?.[0];
      if (!rec) return json(404, origin, { error: 'entry not found' });
      if (rec.fields?.['Status'] !== 'Submitted') {
        return json(409, origin, { error: 'only submitted entries can be reviewed' });
      }

      if (action === 'approve') {
        const fields = {
          Status: 'Approved',
          Reviewed_By: [auth.uid],
          Reviewed_At: new Date().toISOString(),
        };
        if (!(rec.fields?.['Pay_Period'] || []).length && rec.fields?.['Date_Worked']) {
          const pp = await airtableGet(cfg, TABLES.PAY_PERIOD, { pageSize: '100' });
          const hit = (pp.records || []).find((p) => {
            const s = p.fields?.['Starting'], e = p.fields?.['Ending'];
            return s && e && rec.fields['Date_Worked'] >= s && rec.fields['Date_Worked'] <= e;
          });
          if (hit) fields.Pay_Period = [hit.id];
        }
        await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', [{ id, fields }]);
        return json(200, origin, { ok: true });
      }

      // return for clarification
      const comment = String(body.comment || '').trim().slice(0, 2000);
      if (!comment) return json(400, origin, { error: 'a returned entry needs a note saying what to clarify' });
      await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', [
        { id, fields: { Status: 'Returned for Clarification', Reviewed_By: [auth.uid], Reviewed_At: new Date().toISOString() } },
      ]);
      await airtableWrite(cfg, TABLES.MESSAGES, 'POST', [
        {
          fields: {
            Subject: 'Hours returned for clarification',
            Message_Content: comment,
            Author: [auth.uid],
            Time_Entry: [id],
            Anchor_Record_ID: id,
            Visibility: 'Program + Intern',
          },
        },
      ]);
      return json(200, origin, { ok: true });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
