// netlify/functions/view-as.mjs
//
// View as (2026-10-19), modelled on AgentAdmin's "View as client" seat:
// an admin opens the workspace exactly as another user sees it, with
// real data and nothing written as them.
//
//   GET                         → admins: the people they may view as
//   POST { userId, panel? }     → admins: start a session. Verifies the
//                                 caller, checks the target, writes a
//                                 View_As_Log row, and returns a
//                                 one-hour READ-ONLY token for the target
//                                 (claims ro/viewer — requireAuth refuses
//                                 every write made with it).
//
// Who: Admin / Super Admin may view as interns, partners and
// coordinators (real or test accounts), never as another admin and
// never from inside a View as session.

import {
  env,
  TABLES,
  WORKSPACE_ROLES,
  airtableGet,
  airtableWrite,
  fetchUserMap,
  publicUser,
  issueToken,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';

const ADMIN_ROLES = ['Admin', 'SuperAdmin', 'Super Admin'];
const VIEWABLE = WORKSPACE_ROLES.filter((r) => !ADMIN_ROLES.includes(r));

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  const cfg = env();
  if (!cfg) return json(500, origin, { error: 'server not configured' });
  const auth = requireAuth(cfg, event);
  if (!auth) return json(401, origin, { error: 'sign in again' });
  if (auth.ro) return json(403, origin, { error: 'exit View as first' });
  if (!ADMIN_ROLES.includes(auth.role)) return json(403, origin, { error: 'View as is for admins' });

  try {
    const users = await fetchUserMap(cfg);

    if (event.httpMethod === 'GET') {
      const people = Object.entries(users)
        .filter(([id, u]) => id !== auth.uid && VIEWABLE.includes(u.role))
        .map(([id, u]) => ({ id, name: u.name || u.email, email: u.email, role: u.role, isTest: u.isTest }))
        .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));
      return json(200, origin, { people });
    }

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      const id = String(b.userId || '');
      if (!/^rec[A-Za-z0-9]{14}$/.test(id) || id === auth.uid) return json(400, origin, { error: 'pick someone to view as' });
      const rec = (await airtableGet(cfg, TABLES.USERS, { filterByFormula: `RECORD_ID() = '${id}'`, maxRecords: '1' })).records?.[0];
      if (!rec) return json(404, origin, { error: 'user not found' });
      const target = publicUser(rec);
      if (!VIEWABLE.includes(target.role)) return json(403, origin, { error: 'you can view as interns, partners and coordinators only' });

      const viewerName = users[auth.uid]?.name || auth.sub;
      const panel = String(b.panel || 'home').replace(/[^a-z-]/g, '').slice(0, 40) || 'home';
      // Audit first: no log row, no session.
      await airtableWrite(cfg, TABLES.VIEW_AS_LOG, 'POST', [{
        fields: {
          Session: `${viewerName} → ${target.fullName || target.email}`,
          Viewer: [auth.uid],
          Viewed: [target.id],
          Started_At: new Date().toISOString(),
          Panel: panel,
        },
      }]);
      const { token, exp } = issueToken(cfg, {
        email: target.email, role: target.role, userId: target.id, test: target.isTest,
        seat: { viewer: auth.uid, viewerName },
      });
      return json(200, origin, { user: target, token, exp, viewer: { id: auth.uid, name: viewerName } });
    }

    return json(405, origin, { error: 'method not allowed' });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
