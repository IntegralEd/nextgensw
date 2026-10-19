// Same-origin fetch wrappers over the Netlify Functions API.
// Token lives in memory only — no cookies, no localStorage — so
// third-party-cookie blocking inside the Softr iframe never matters
// and nothing sensitive persists in the browser.

let session = null; // { token, exp, user, seat? }
let ownSession = null; // the admin's own session while viewing as someone
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
export const onSessionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function currentUser() {
  return session?.user || null;
}

// ---- View as (read-only seat; netlify/functions/view-as.mjs) ----------
// The seat's token carries the viewed user's identity and a read-only
// flag the server enforces. It lives in memory only: a reload ends it.
export function currentSeat() {
  return session?.seat || null; // { viewer: {id, name}, user }
}
export async function startSeat(userId, panel) {
  const r = await apiFetch('view-as', { method: 'POST', body: JSON.stringify({ userId, panel }) });
  ownSession = ownSession || session;
  session = { token: r.token, exp: r.exp, user: r.user, seat: { viewer: r.viewer } };
  notify();
  return r.user;
}
export function endSeat() {
  if (ownSession) session = ownSession;
  ownSession = null;
  notify();
}

export async function signIn(assertedEmail) {
  const res = await fetch('/.netlify/functions/me', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: assertedEmail }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `me failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  session = body; // { token, exp, user }
  return body.user;
}

// "Show test data" (staff only): a per-browser switch, so it's
// localStorage — a convenience, not state anyone else depends on. The
// server only honours the header for staff (_lib/testdata.mjs).
const SHOW_TEST_KEY = 'ngsw.showTest';
const STAFF = ['Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'];
export function getShowTest() {
  if (!STAFF.includes(session?.user?.role)) return false;
  try { return window.localStorage.getItem(SHOW_TEST_KEY) === '1'; } catch { return false; }
}
export function setShowTest(on) {
  try {
    if (on) window.localStorage.setItem(SHOW_TEST_KEY, '1');
    else window.localStorage.removeItem(SHOW_TEST_KEY);
  } catch { /* blocked storage: the switch just won't stick */ }
}

export async function apiFetch(path, options = {}) {
  if (!session?.token) throw new Error('not signed in');
  const method = String(options.method || 'GET').toUpperCase();
  if (session.seat && method !== 'GET') {
    // The server refuses it anyway; say why instead of "sign in again".
    const err = new Error(`View as is read-only. Nothing was changed for ${session.user?.fullName || 'this person'}.`);
    err.status = 403;
    throw err;
  }
  const res = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${session.token}`,
      ...(getShowTest() ? { 'X-Show-Test': '1' } : {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `${path} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}
