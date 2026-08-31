// netlify/functions/pay-periods.mjs
//
// Pay-period administration (staff only). Weekly cadence, admin-
// defined dates, server-validated. The toast blockers in the admin
// panel are just messengers for the rejections here — a stale browser
// can't sneak a bad record past this file.
//
//   GET  → all periods sorted by Starting (id, label, dates, sequence,
//          current flag, entry count)
//   POST { action: 'seed', firstMonday, weeks }        → create Mon–Sun weeks
//   POST { action: 'update', id, starting, ending }    → edit one period
//   POST { action: 'delete', id }                      → delete (only if no entries)
//
// Rules enforced: Ending >= Starting; no overlap with any other
// period; edits may not open a gap against date-adjacent neighbors.
// After every accepted change, Sequence is rewritten dense (1…n by
// Starting) — date order is the source of truth, Sequence a
// convenience.

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

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (isoDate, n) => iso(new Date(new Date(`${isoDate}T00:00:00Z`).getTime() + n * DAY));

function label(startISO, endISO) {
  const [sy, sm, sd] = startISO.split('-').map(Number);
  const [ey, em, ed] = endISO.split('-').map(Number);
  return `${sm}/${sd} - ${em}/${ed}/${String(ey).slice(2)}`;
}

async function allPeriods(cfg) {
  const data = await airtableGet(cfg, TABLES.PAY_PERIOD, {
    pageSize: '100',
    'sort[0][field]': 'Starting',
    'sort[0][direction]': 'asc',
  });
  return data.records || [];
}

function publicPeriod(r) {
  const f = r.fields || {};
  return {
    id: r.id,
    label: f['Label'] || '',
    starting: f['Starting'] || null,
    ending: f['Ending'] || null,
    sequence: f['Sequence'] ?? null,
    isCurrent: f['Is_Current'] === 1 || f['Is_Current'] === true,
    entryCount: (f['Time_Entries'] || []).length,
    totalHours: f['Total_Hours'] ?? 0,
  };
}

async function renumber(cfg, periods) {
  const sorted = [...periods].sort((a, b) =>
    String(a.fields?.['Starting']).localeCompare(String(b.fields?.['Starting'])));
  const fixes = [];
  sorted.forEach((r, i) => {
    if (r.fields?.['Sequence'] !== i + 1) fixes.push({ id: r.id, fields: { Sequence: i + 1 } });
  });
  for (let i = 0; i < fixes.length; i += 10) {
    await airtableWrite(cfg, TABLES.PAY_PERIOD, 'PATCH', fixes.slice(i, i + 10));
  }
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
    return json(403, origin, { error: 'pay periods are managed by program staff' });
  }

  try {
    if (event.httpMethod === 'GET') {
      return json(200, origin, { periods: (await allPeriods(cfg)).map(publicPeriod) });
    }

    if (event.httpMethod !== 'POST') return json(405, origin, { error: 'method not allowed' });
    const body = JSON.parse(event.body || '{}');
    const periods = await allPeriods(cfg);

    if (body.action === 'seed') {
      const first = String(body.firstMonday || '').slice(0, 10);
      const weeks = Math.floor(Number(body.weeks));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(first)) return json(400, origin, { error: 'pick the first Monday' });
      if (new Date(`${first}T00:00:00Z`).getUTCDay() !== 1) {
        return json(400, origin, { error: `${first} isn't a Monday — pay weeks start on Monday` });
      }
      if (!Number.isFinite(weeks) || weeks < 1 || weeks > 60) {
        return json(400, origin, { error: 'weeks must be between 1 and 60' });
      }
      const records = [];
      for (let w = 0; w < weeks; w++) {
        const s = addDays(first, w * 7);
        const e = addDays(s, 6);
        const clash = periods.find((p) => s <= p.fields?.['Ending'] && e >= p.fields?.['Starting']);
        if (clash) {
          return json(409, origin, {
            error: `week ${s} overlaps the existing period ${clash.fields?.['Label'] || clash.fields?.['Starting']} — nothing was created`,
          });
        }
        records.push({ fields: { Label: label(s, e), Starting: s, Ending: e } });
      }
      for (let i = 0; i < records.length; i += 10) {
        await airtableWrite(cfg, TABLES.PAY_PERIOD, 'POST', records.slice(i, i + 10));
      }
      await renumber(cfg, await allPeriods(cfg));
      return json(201, origin, { periods: (await allPeriods(cfg)).map(publicPeriod) });
    }

    if (body.action === 'update') {
      const rec = periods.find((p) => p.id === body.id);
      if (!rec) return json(404, origin, { error: 'period not found' });
      const s = String(body.starting || '').slice(0, 10);
      const e = String(body.ending || '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
        return json(400, origin, { error: 'both dates are required' });
      }
      if (e < s) return json(400, origin, { error: 'the end date is before the start date' });
      const others = periods.filter((p) => p.id !== rec.id);
      const clash = others.find((p) => s <= p.fields?.['Ending'] && e >= p.fields?.['Starting']);
      if (clash) {
        return json(409, origin, { error: `those dates overlap ${clash.fields?.['Label'] || 'another period'}` });
      }
      const prev = others.filter((p) => p.fields?.['Ending'] < s).pop();
      const next = others.find((p) => p.fields?.['Starting'] > e);
      if (prev && addDays(prev.fields['Ending'], 1) !== s) {
        return json(409, origin, { error: `that leaves a gap after ${prev.fields?.['Label']} — periods must be back-to-back` });
      }
      if (next && addDays(e, 1) !== next.fields['Starting']) {
        return json(409, origin, { error: `that leaves a gap before ${next.fields?.['Label']} — periods must be back-to-back` });
      }
      await airtableWrite(cfg, TABLES.PAY_PERIOD, 'PATCH', [
        { id: rec.id, fields: { Starting: s, Ending: e, Label: label(s, e) } },
      ]);
      await renumber(cfg, await allPeriods(cfg));
      return json(200, origin, { periods: (await allPeriods(cfg)).map(publicPeriod) });
    }

    if (body.action === 'delete') {
      const rec = periods.find((p) => p.id === body.id);
      if (!rec) return json(404, origin, { error: 'period not found' });
      if ((rec.fields?.['Time_Entries'] || []).length) {
        return json(409, origin, { error: 'that period has time entries linked — it can\'t be deleted' });
      }
      const res = await fetch(
        `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(TABLES.PAY_PERIOD)}/${rec.id}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${cfg.patWrite}` } }
      );
      if (!res.ok) throw new Error(`delete: ${res.status}`);
      await renumber(cfg, await allPeriods(cfg));
      return json(200, origin, { periods: (await allPeriods(cfg)).map(publicPeriod) });
    }

    return json(400, origin, { error: 'unknown action' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
