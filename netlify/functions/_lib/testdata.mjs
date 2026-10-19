// netlify/functions/_lib/testdata.mjs
//
// The test-data fence (2026-10-19). Test/QA accounts (Users.Is_Test)
// stay usable for demos and training alongside the live program, but
// nothing they create reaches real users:
//
//   - Every Task, Time_Entry, Event and Message created by or for a
//     test account is stamped Is_Test at write time (stampTest).
//   - Reads drop Is_Test rows (dropTest) unless the caller may see them:
//     a test account always does; staff do when they switch on
//     "Show test data" (the X-Show-Test: 1 header). Real interns and
//     partners never do.
//   - Payroll (export, finalize) always excludes test rows.
//   - Test users are left out of real people pickers and rosters.

import { STAFF_ROLES } from './workspace.mjs';

export const isTestRow = (r) => (r?.fields || r || {})['Is_Test'] === true;

export function showTest(auth, event) {
  if (auth?.test) return true;
  if (!STAFF_ROLES.includes(auth?.role)) return false;
  const h = event?.headers || {};
  return String(h['x-show-test'] || h['X-Show-Test'] || '') === '1';
}

export const dropTest = (records, show) => (show ? records : records.filter((r) => !isTestRow(r)));

// A user id → is it a test account? (users = fetchUserMap result)
export const testUser = (users, id) => Boolean(id && users?.[id]?.isTest);

// Fields to merge into a new row when any of the conditions hold.
export const stampTest = (...conds) => (conds.some(Boolean) ? { Is_Test: true } : {});

// Airtable formula fragment excluding test rows.
export const NOT_TEST = 'NOT({Is_Test})';
