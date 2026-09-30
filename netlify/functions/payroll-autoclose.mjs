// netlify/functions/payroll-autoclose.mjs
//
// Daily date-gate: any pay period whose Payroll_Review_Close has passed
// and isn't finalized yet gets auto-approved for payroll, so hours
// don't stall if an admin doesn't get to them in time. Manual admin
// approval before the close still takes precedence (it just finalizes
// early).
//
// Netlify scheduled function — runs on the cron below, no HTTP auth.

import { env, TABLES, airtableGet } from './_lib/workspace.mjs';
import { finalizePeriod } from './_lib/payroll.mjs';

export const config = { schedule: '@daily' };

export default async function handler() {
  const cfg = env();
  if (!cfg || !cfg.patWrite) {
    console.error('payroll-autoclose: not configured (need AIRTABLE_PAT_WRITE)');
    return new Response('not configured', { status: 500 });
  }
  const today = new Date().toISOString().slice(0, 10);
  const data = await airtableGet(cfg, TABLES.PAY_PERIOD, {
    filterByFormula: `AND({Payroll_Review_Close} != '', IS_BEFORE({Payroll_Review_Close}, TODAY()), NOT({Payroll_Finalized}))`,
    pageSize: '100',
  });
  const periods = data.records || [];
  let total = 0;
  for (const p of periods) {
    const n = await finalizePeriod(cfg, p, null); // null = automatic
    total += n;
    console.log(`payroll-autoclose: finalized ${p.fields?.['Label'] || p.id} (${n} entries)`);
  }
  console.log(`payroll-autoclose ${today}: ${periods.length} period(s), ${total} entries approved`);
  return new Response(JSON.stringify({ periods: periods.length, entries: total }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
