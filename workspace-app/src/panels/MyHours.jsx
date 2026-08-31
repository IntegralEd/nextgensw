// The intern's own time entries: status at a glance, weekly total,
// submit or discard drafts. Approved entries are read-only; entries
// returned for clarification can be edited and resubmitted.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_CHIP = {
  Draft: 'draft',
  Submitted: 'submitted',
  Approved: 'approved',
  'Returned for Clarification': 'returned',
};

const hrs = (m) => (m / 60).toFixed(m % 60 === 0 ? 0 : 2);

function startOfWeekMonday(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // Mon=0
  const monday = new Date(d);
  monday.setDate(d.getDate() - day);
  return monday.toISOString().slice(0, 10);
}

export default function MyHours() {
  const [entries, setEntries] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('time-entries').then((r) => setEntries(r.entries)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  async function act(id, action) {
    setBusyId(id);
    try {
      await apiFetch('time-entries', { method: 'PATCH', body: JSON.stringify({ id, action }) });
      await load();
      flash(action === 'submit' ? 'Submitted ✓' : 'Draft discarded');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusyId(null);
    }
  }

  const weekTotal = useMemo(() => {
    if (!entries) return 0;
    const monday = startOfWeekMonday();
    return entries
      .filter((e) => e.date >= monday && e.status !== 'Draft')
      .reduce((sum, e) => sum + (e.minutes || 0), 0);
  }, [entries]);

  if (!entries) return <div className="panel center muted">Loading your hours…</div>;

  return (
    <div className="panel">
      <h1>My hours</h1>
      <p className="muted lead">
        {hrs(weekTotal)} hours submitted this week (since Monday).
      </p>

      {entries.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No hours yet — use <strong>Log hours</strong> to add your first entry.
          </p>
        </div>
      )}

      {entries.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Date</th><th>Hours</th><th>Kind of work</th><th>Notes</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.date}</td>
                  <td>{hrs(e.minutes)}</td>
                  <td>{e.category}</td>
                  <td>{e.notes ? String(e.notes).replace(/\n+/g, ' ').slice(0, 80) : '—'}</td>
                  <td>
                    <span className={`chip ${STATUS_CHIP[e.status] || 'draft'}`}>{e.status}</span>
                    {e.reviewNote && (
                      <div className="muted" style={{ marginTop: 4, fontSize: '0.85rem' }}>
                        “{e.reviewNote}”
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {e.status === 'Draft' && (
                      <>
                        <button className="btn btn-secondary btn-sm" disabled={busyId === e.id} onClick={() => act(e.id, 'submit')}>Submit</button>{' '}
                        <button className="btn btn-ghost btn-sm" disabled={busyId === e.id} onClick={() => act(e.id, 'discard')}>Discard</button>
                      </>
                    )}
                    {e.status === 'Returned for Clarification' && (
                      <button className="btn btn-secondary btn-sm" disabled={busyId === e.id} onClick={() => act(e.id, 'submit')}>Resubmit</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
