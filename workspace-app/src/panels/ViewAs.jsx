// View as (admins): pick a person and a page, and see the workspace
// exactly as they do, read-only. Every session is logged (View_As_Log).
// Server: netlify/functions/view-as.mjs.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch, startSeat } from '../api.js';
import { PANELS } from './index.jsx';

const SKIP = ['view-as', 'testing-guide', 'whoami'];
const pagesFor = (role) => Object.entries(PANELS)
  .filter(([key, p]) => !SKIP.includes(key) && (p.roles.includes('*') || p.roles.includes(role)))
  .map(([key, p]) => ({ key, title: p.title }));

export default function ViewAs() {
  const [people, setPeople] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(null);
  const [page, setPage] = useState('home');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch('view-as').then((r) => setPeople(r.people)).catch((e) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (people || []).filter((p) => !t || `${p.name} ${p.email} ${p.role}`.toLowerCase().includes(t));
  }, [people, q]);

  async function go() {
    setBusy(true); setError(null);
    try {
      await startSeat(pick.id, page);
      window.location.hash = `#/${page}`;
    } catch (e) { setError(e.message); setBusy(false); }
  }

  if (error && !people) return <div className="panel center muted">{error}</div>;
  if (!people) return <div className="panel center muted">Loading people…</div>;

  return (
    <div className="panel">
      <h1>View as</h1>
      <p className="muted lead">
        See the workspace exactly as someone else does, with their real data. It's read-only: nothing you click
        saves anything as them, and each session is logged. Reloading the page ends it.
      </p>

      <input type="search" className="guide-search" placeholder="Search by name, email or role" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="guide-list">
        {shown.map((p) => (
          <button key={p.id} className={pick?.id === p.id ? 'active' : ''} onClick={() => { setPick(p); setPage('home'); }}>
            {p.name} · {p.role}{p.isTest ? ' · test' : ''}
          </button>
        ))}
        {!shown.length && <span className="muted">No one matches.</span>}
      </div>

      {pick && (
        <div className="card">
          <label>Open as {pick.name} on</label>
          <select value={page} onChange={(e) => setPage(e.target.value)}>
            {pagesFor(pick.role).map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}
          </select>
          <div className="actions">
            <button className="btn btn-primary" disabled={busy} onClick={go}>View as {pick.name}</button>
          </div>
          {error && <p className="wn-error">{error}</p>}
        </div>
      )}
    </div>
  );
}
