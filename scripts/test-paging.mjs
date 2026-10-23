// Regression test for Airtable paging (2026-10-23): payroll paths must
// see EVERY matching row, not just the first page of 100.
// Runs offline against a fake Airtable: `npm run test:paging`.
//
// The fake serves 250 time entries across Mon–Sun weeks (pageSize 100,
// offset tokens), evaluates the few filterByFormula shapes these
// endpoints use, and records writes, so the checks don't depend on
// real data or touch the live base.

process.env.AIRTABLE_BASE_ID = 'appTEST';
process.env.AIRTABLE_PAT_READ = 'patREAD';
process.env.AIRTABLE_PAT_WRITE = 'patWRITE';
process.env.WORKSPACE_SESSION_SECRET = 'test-secret';

const F = new URL('../netlify/functions/', import.meta.url).pathname;
const { issueToken, env } = await import(F + '_lib/workspace.mjs');

// ---- fake data --------------------------------------------------------
const WEEKS = [['2026-10-05', '2026-10-11'], ['2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-25']];
const periods = WEEKS.map(([s, e], i) => ({ id: `recPERIOD00000${i}`.slice(0, 17).padEnd(17, '0'), fields: { Starting: s, Ending: e, Label: `w${i}` } }));
const day = (week, i) => { const d = new Date(`${WEEKS[week][0]}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + (i % 7)); return d.toISOString().slice(0, 10); };
// 250 entries, oldest week first so a 100-row cap drops the newest:
//   week 0: 130 Approved   (export must return all 130)
//   week 1: 110 Submitted  (finalize must approve all 110)
//   week 2:  10 Submitted  (pay periods must show 10 to approve)
const plan = (i) => (i < 130 ? [0, 'Approved'] : i < 240 ? [1, 'Submitted'] : [2, 'Submitted']);
const entries = Array.from({ length: 250 }, (_, i) => ({
  id: `recENTRY${String(i).padStart(9, '0')}`,
  fields: {
    Date_Worked: day(plan(i)[0], i),
    Status: plan(i)[1],
    Minutes: 60,
    Intern: ['recINTERN00000001'],
    Intern_Record_ID: 'recINTERN00000001',
  },
}));
const tables = {
  Pay_Period: periods,
  Time_Entries: entries,
  Users: [{ id: 'recINTERN00000001', fields: { 'Full Name': 'Pat Intern', Email: 'pat@example.org', User_Role: 'Intern' } },
          { id: 'recADMIN000000001', fields: { 'Full Name': 'Ada Admin', Email: 'ada@example.org', User_Role: 'Admin' } }],
  Messages: [],
};
const writes = [];

// Minimal formula evaluator for the shapes these endpoints send.
function matches(f, formula) {
  if (!formula) return true;
  const st = f.Status, d = f.Date_Worked;
  const conds = [];
  for (const m of formula.matchAll(/\{Status\} (!=|=) '([^']+)'/g)) conds.push(m[1] === '=' ? st === m[2] : st !== m[2]);
  for (const m of formula.matchAll(/\{Date_Worked\} (>=|<=) '([^']+)'/g)) conds.push(m[1] === '>=' ? d >= m[2] : d <= m[2]);
  for (const m of formula.matchAll(/NOT\(IS_BEFORE\(\{Date_Worked\}, '([^']+)'\)\)/g)) conds.push(d >= m[1]);
  for (const m of formula.matchAll(/\{Intern_Record_ID\} = '([^']+)'/g)) conds.push(f.Intern_Record_ID === m[1]);
  return conds.every(Boolean);
}

globalThis.fetch = async (url, opts = {}) => {
  const u = new URL(url);
  const table = decodeURIComponent(u.pathname.split('/').pop());
  const ok = (body) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
  if (opts.method && opts.method !== 'GET') {
    const body = JSON.parse(opts.body || '{}');
    writes.push({ table, method: opts.method, records: body.records || [] });
    for (const r of body.records || []) {
      const row = (tables[table] || []).find((x) => x.id === r.id);
      if (row) Object.assign(row.fields, r.fields);
    }
    return ok({ records: (body.records || []).map((r) => ({ id: r.id || 'recNEW', fields: r.fields })) });
  }
  const formula = u.searchParams.get('filterByFormula');
  const idMatch = formula && formula.match(/^RECORD_ID\(\) = '([^']+)'$/);
  let rows = (tables[table] || []).filter((r) => (idMatch ? r.id === idMatch[1] : matches(r.fields, formula)));
  const size = Number(u.searchParams.get('pageSize') || 100);
  const start = Number(u.searchParams.get('offset') || 0);
  const page = rows.slice(start, start + size);
  return ok({ records: page, ...(start + size < rows.length ? { offset: String(start + size) } : {}) });
};

// ---- checks -----------------------------------------------------------
const cfg = env();
const admin = issueToken(cfg, { email: 'ada@example.org', role: 'Admin', userId: 'recADMIN000000001' }).token;
const intern = issueToken(cfg, { email: 'pat@example.org', role: 'Intern', userId: 'recINTERN00000001' }).token;
const call = async (name, token, method = 'GET', qs = {}, body = null) => {
  const { handler } = await import(F + name + '.mjs');
  const r = await handler({ httpMethod: method, headers: { origin: 'https://nextgensw.org', authorization: `Bearer ${token}` }, queryStringParameters: qs, body: body && JSON.stringify(body) });
  return { status: r.statusCode, body: JSON.parse(r.body || '{}') };
};
let failed = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failed += 1; };
const expect = (p, status) => entries.filter((e) => e.fields.Status === status && e.fields.Date_Worked >= p.fields.Starting && e.fields.Date_Worked <= p.fields.Ending).length;

// 1. Pay periods counts cover every week (the reported bug).
let r = await call('pay-periods', admin);
const newest = periods[2];
const row = r.body.periods?.find((p) => p.id === newest.id);
check(r.status === 200 && row?.submitted === expect(newest, 'Submitted') && row.submitted > 0,
  `pay periods: newest week shows ${row?.submitted} to approve (expected ${expect(newest, 'Submitted')})`);
check(periods.every((p) => r.body.periods.find((x) => x.id === p.id)?.submitted === expect(p, 'Submitted')),
  'pay periods: every week counts all its submitted entries');

// 2. Review timesheets lists every non-draft entry.
r = await call('review-hours', admin);
check(r.status === 200 && r.body.entries?.length === 250, `review timesheets: ${r.body.entries?.length} of 250 entries listed`);

// 3. An intern's My hours lists every entry.
r = await call('time-entries', intern);
check(r.status === 200 && r.body.entries?.length === 250, `my hours: ${r.body.entries?.length} of 250 entries listed`);

// 4. Payroll export covers the whole week.
const exportWeek = periods[0];
r = await call('export-hours', admin, 'GET', { period: exportWeek.id });
const exported = r.body.rows?.length ?? r.body.entries?.length;
check(r.status === 200 && exported === expect(exportWeek, 'Approved'), `export: ${exported} approved rows (expected ${expect(exportWeek, 'Approved')})`);

// 5. Finalize approves every submitted entry in the week, past 100.
const { finalizePeriod } = await import(F + '_lib/payroll.mjs');
const wk = periods[1];
const before = expect(wk, 'Submitted');
const n = await finalizePeriod(cfg, wk, 'recADMIN000000001');
check(n === before && expect(wk, 'Submitted') === 0, `finalize: approved ${n} of ${before} submitted entries; ${expect(wk, 'Submitted')} left`);

console.log(failed ? `\n${failed} check(s) failed` : '\nall paging checks passed');
process.exit(failed ? 1 : 0);
