// netlify/functions/export-hours.mjs
//
// Payroll export — the one report Ava's requirements mark as required
// ("weekly/pay period hours by intern"). Staff only.
//
//   GET  ?period=recXXX → JSON for the pay-periods panel to turn into
//        a CSV download: per-intern totals + per-entry detail of all
//        APPROVED entries in that period, plus their Paid state
//   POST { periodId, action: 'mark-paid' } → sets Paid on every
//        approved entry in the period (run after the export lands in
//        payroll, so "what's unexported" stays a one-filter question)

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

async function approvedInPeriod(cfg, periodId) {
  const period = (
    await airtableGet(cfg, TABLES.PAY_PERIOD, {
      filterByFormula: `RECORD_ID() = '${periodId}'`,
      maxRecords: '1',
    })
  ).records?.[0];
  if (!period) return { period: null, records: [] };
  const s = period.fields?.['Starting'], e = period.fields?.['Ending'];
  const data = await airtableGet(cfg, TABLES.TIME_ENTRIES, {
    filterByFormula: `AND({Status} = 'Approved', {Date_Worked} >= '${s}', {Date_Worked} <= '${e}')`,
    pageSize: '100',
    'sort[0][field]': 'Date_Worked',
    'sort[0][direction]': 'asc',
  });
  return { period, records: data.records || [] };
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
    return json(403, origin, { error: 'exports are a coordinator/admin function' });
  }

  try {
    if (event.httpMethod === 'GET') {
      const periodId = String(event.queryStringParameters?.period || '');
      if (!/^rec[A-Za-z0-9]{14}$/.test(periodId)) return json(400, origin, { error: 'bad period id' });
      const [{ period, records }, users] = await Promise.all([
        approvedInPeriod(cfg, periodId),
        fetchUserMap(cfg),
      ]);
      if (!period) return json(404, origin, { error: 'period not found' });

      const rows = records.map((r) => {
        const f = r.fields || {};
        const who = users[(f['Intern'] || [])[0]] || { name: '(unknown)', email: '' };
        return {
          intern: who.name,
          email: who.email,
          date: f['Date_Worked'],
          hours: Math.round(((f['Minutes'] || 0) / 60) * 100) / 100,
          category: f['Work_Category'] || '',
          notes: String(f['Notes'] || '').replace(/\s+/g, ' ').trim(),
          paid: f['Paid'] === true,
        };
      });
      const totalsMap = {};
      for (const r of rows) {
        const key = r.email || r.intern;
        totalsMap[key] ||= { intern: r.intern, email: r.email, hours: 0 };
        totalsMap[key].hours = Math.round((totalsMap[key].hours + r.hours) * 100) / 100;
      }
      return json(200, origin, {
        period: { id: period.id, label: period.fields?.['Label'] || '' },
        totals: Object.values(totalsMap).sort((a, b) => a.intern.localeCompare(b.intern)),
        rows,
      });
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      if (body.action !== 'mark-paid') return json(400, origin, { error: 'unknown action' });
      const periodId = String(body.periodId || '');
      if (!/^rec[A-Za-z0-9]{14}$/.test(periodId)) return json(400, origin, { error: 'bad period id' });
      const { period, records } = await approvedInPeriod(cfg, periodId);
      if (!period) return json(404, origin, { error: 'period not found' });
      const unpaid = records.filter((r) => r.fields?.['Paid'] !== true);
      for (let i = 0; i < unpaid.length; i += 10) {
        await airtableWrite(
          cfg,
          TABLES.TIME_ENTRIES,
          'PATCH',
          unpaid.slice(i, i + 10).map((r) => ({ id: r.id, fields: { Paid: true } }))
        );
      }
      return json(200, origin, { ok: true, marked: unpaid.length });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
