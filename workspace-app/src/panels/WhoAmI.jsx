// Stage 0 debug panel: shows what the identity handshake resolved.
// Proves the whole loop — Softr embed → asserted email → /api/me
// verification → role-aware panel — before any real feature ships.

import { currentUser } from '../api.js';

export default function WhoAmI() {
  const user = currentUser();
  if (!user) return null;
  const rows = [
    ['Email', user.email],
    ['Name', user.fullName],
    ['Role', user.role],
    ['Organization', user.organization],
    ['Title', user.title],
    ['Cohort links', (user.cohortIds || []).length],
    ['Partner org links', (user.partnerOrgIds || []).length],
  ];
  return (
    <div className="panel">
      <h1>Who am I</h1>
      <table className="kv">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v === null || v === undefined || v === '' ? '—' : String(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">
        Verified against the Users table by /api/me. If this looks wrong,
        the Airtable record is wrong — the app only reflects it.
      </p>
    </div>
  );
}
