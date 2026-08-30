// Same-origin fetch wrappers over the Netlify Functions API.
// Token lives in memory only — no cookies, no localStorage — so
// third-party-cookie blocking inside the Softr iframe never matters
// and nothing sensitive persists in the browser.

let session = null; // { token, exp, user }

export function currentUser() {
  return session?.user || null;
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

export async function apiFetch(path, options = {}) {
  if (!session?.token) throw new Error('not signed in');
  const res = await fetch(`/.netlify/functions/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
      Authorization: `Bearer ${session.token}`,
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
