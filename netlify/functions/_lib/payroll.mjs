// netlify/functions/_lib/payroll.mjs
//
// Finalizing a pay period = approving all its still-submitted hours for
// payroll and locking the period. Shared by the admin "Finalize now"
// action (pay-periods.mjs) and the daily auto-close cron
// (payroll-autoclose.mjs), so both behave identically.

import { TABLES, airtableGet, airtableWrite } from './workspace.mjs';

// Approve every Submitted entry in the period's date range, link it to
// the period, and mark the period finalized. `reviewedBy` is the admin's
// user id for a manual finalize, or null for the automatic date-gate.
// Returns the number of entries approved.
export async function finalizePeriod(cfg, period, reviewedBy = null) {
  const f = period.fields || {};
  const start = f['Starting'], end = f['Ending'];
  if (!start || !end) throw new Error('period has no start/end date');

  const data = await airtableGet(cfg, TABLES.TIME_ENTRIES, {
    filterByFormula: `AND({Status} = 'Submitted', {Date_Worked} >= '${start}', {Date_Worked} <= '${end}')`,
    pageSize: '100',
  });
  const now = new Date().toISOString();
  const updates = (data.records || []).map((r) => {
    const ef = { Status: 'Approved', Reviewed_At: now };
    if (reviewedBy) ef.Reviewed_By = [reviewedBy];
    if (!(r.fields?.['Pay_Period'] || []).length) ef.Pay_Period = [period.id];
    return { id: r.id, fields: ef };
  });
  for (let i = 0; i < updates.length; i += 10) {
    await airtableWrite(cfg, TABLES.TIME_ENTRIES, 'PATCH', updates.slice(i, i + 10));
  }

  await airtableWrite(cfg, TABLES.PAY_PERIOD, 'PATCH', [
    { id: period.id, fields: { Payroll_Finalized: true, Payroll_Finalized_At: now } },
  ]);
  return updates.length;
}
