// netlify/functions/_lib/workspace.mjs
//
// Shared server lib for the workspace panel app (modeled on WorkBase
// api/_lib/airtable.js). Three jobs:
//   1. Table constants + per-role field allowlists — the ONLY fields
//      that ever serialize to a client. Sensitive fields (Users.
//      Support_Notes, Partner_Orgs.Admin_Notes) are simply absent.
//   2. Airtable REST helpers (read PAT).
//   3. Session tokens: HMAC-signed, short-lived, carried in the
//      Authorization header. No cookies — the app runs inside a Softr
//      iframe where third-party cookies can't be trusted to work.
//
// Env required (Netlify → Site config → Environment variables):
//   AIRTABLE_BASE_ID          — appAWSOlM2P9kqgOV
//   AIRTABLE_PAT_READ         — PAT scoped to data.records:read
//   AIRTABLE_PAT_WRITE        — PAT scoped to data.records:read +
//                               data.records:write on this base; used
//                               by every mutating endpoint (time
//                               entries, tasks, messages, pay-period
//                               admin). NOTE: originally scoped to
//                               records:create only for the contact
//                               form — the workspace needs updates
//                               too, so re-scope it in Airtable.
//   WORKSPACE_SESSION_SECRET  — long random string; rotating it
//                               invalidates all live sessions (fine —
//                               the app re-signs in transparently)

import { createHmac, timingSafeEqual } from 'node:crypto';

export const TABLES = {
  USERS: 'Users',
  COHORTS: 'Cohorts',
  PARTNER_ORGS: 'Partner_Orgs',
  TASKS: 'Tasks',
  TIME_ENTRIES: 'Time_Entries',
  PAY_PERIOD: 'Pay_Period',
  EVENTS: 'Events',
  SKILL_AREAS: 'Skill_Areas',
  MESSAGES: 'Messages',
};

// Roles allowed into the workspace at all. Applicant/Inactive stay out.
export const WORKSPACE_ROLES = [
  'Intern',
  'Coordinator',
  'Employer',
  'Sponsor',
  'Admin',
  'SuperAdmin',
];
export const STAFF_ROLES = ['Coordinator', 'Admin', 'SuperAdmin'];

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12h — one workspace day

export function env() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const pat = process.env.AIRTABLE_PAT_READ;
  const secret = process.env.WORKSPACE_SESSION_SECRET;
  if (!baseId || !pat || !secret) return null;
  // patWrite is null-tolerant: read-only endpoints (me) work without
  // it; mutating endpoints must check for it and 500 when absent.
  return { baseId, pat, patWrite: process.env.AIRTABLE_PAT_WRITE || null, secret };
}

export async function airtableGet(cfg, table, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(table)}${qs ? `?${qs}` : ''}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.pat}` } });
  if (!res.ok) throw new Error(`airtable ${table}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Mutations always ride the write PAT. `records` follows the Airtable
// REST shape: POST [{fields}], PATCH [{id, fields}]. Callers are
// responsible for having already authorized the change against the
// caller's verified identity (requireAuth + ownership checks).
export async function airtableWrite(cfg, table, method, records) {
  if (!cfg.patWrite) throw new Error('AIRTABLE_PAT_WRITE not configured');
  const res = await fetch(`https://api.airtable.com/v0/${cfg.baseId}/${encodeURIComponent(table)}`, {
    method, // 'POST' create | 'PATCH' update
    headers: { Authorization: `Bearer ${cfg.patWrite}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, typecast: true }),
  });
  if (!res.ok) throw new Error(`airtable ${table} ${method}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

export async function findUserByEmail(cfg, email) {
  // Escape single quotes so a crafted email can't break the formula.
  const safe = email.toLowerCase().replace(/'/g, "\\'");
  const data = await airtableGet(cfg, TABLES.USERS, {
    filterByFormula: `LOWER({Email}) = '${safe}'`,
    maxRecords: '1',
  });
  return data.records?.[0] || null;
}

// The ONLY Users fields a client ever sees about itself.
export function publicUser(record) {
  const f = record.fields || {};
  return {
    id: record.id,
    email: f['Email'] || null,
    fullName: (f['Full Name'] || '').trim() || null,
    role: f['User_Role'] || null,
    organization: f['Organization'] || null,
    title: f['Title'] || null,
    cohortIds: f['Cohorts'] || [],
    partnerOrgIds: f['Partner_Org'] || [],
  };
}

// ---- session tokens ----------------------------------------------------

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(cfg, { email, role, userId }) {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = b64u(JSON.stringify({ sub: email, role, uid: userId, exp }));
  return { token: `${payload}.${sign(payload, cfg.secret)}`, exp };
}

// Returns the claims ({ sub, role, uid, exp }) or null.
export function verifyToken(cfg, token) {
  const [payload, sig] = String(token || '').split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload, cfg.secret);
  const a = Buffer.from(sig), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let claims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  } catch {
    return null;
  }
  if (!claims.exp || Date.now() > claims.exp) return null;
  return claims;
}

// For endpoints after /me: pull + verify the bearer token in one call.
export function requireAuth(cfg, event) {
  const header = event.headers.authorization || event.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  return verifyToken(cfg, token);
}

// ---- response helpers --------------------------------------------------

const ALLOWED_ORIGINS = [
  'https://nextgensw.org',
  'https://www.nextgensw.org',
  'http://localhost:8888', // netlify dev
  'http://localhost:5173', // vite dev
];

export function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://nextgensw.org';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
}

export function json(statusCode, origin, body) {
  return {
    statusCode,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
