// netlify/functions/me.mjs
//
// The workspace identity handshake. The panel app sends the
// Softr-asserted email; we verify it against the Users table, check
// the role is workspace-eligible, and return the public user profile
// plus a signed session token. Every later endpoint requires that
// token — the asserted email is never trusted past this point, and
// even here it grants nothing unless the address is already
// registered in Users by an admin.
//
// POST { email } → 200 { user, token, exp }
//                  403 { error: 'not_registered' | 'not_workspace_role' }

import {
  env,
  findUserByEmail,
  publicUser,
  issueToken,
  WORKSPACE_ROLES,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, origin, { error: 'method not allowed' });
  }

  const cfg = env();
  if (!cfg) return json(500, origin, { error: 'server not configured' });

  let email;
  try {
    email = String(JSON.parse(event.body || '{}').email || '').trim().slice(0, 200);
  } catch {
    return json(400, origin, { error: 'bad json' });
  }
  if (!email || !/.+@.+\..+/.test(email)) {
    return json(400, origin, { error: 'invalid email' });
  }

  try {
    const record = await findUserByEmail(cfg, email);
    if (!record) return json(403, origin, { error: 'not_registered' });

    const user = publicUser(record);
    if (!WORKSPACE_ROLES.includes(user.role)) {
      return json(403, origin, { error: 'not_workspace_role' });
    }

    const { token, exp } = issueToken(cfg, {
      email: user.email,
      role: user.role,
      userId: user.id,
    });
    return json(200, origin, { user, token, exp });
  } catch (err) {
    return json(502, origin, { error: `lookup failed: ${err.message}` });
  }
}
