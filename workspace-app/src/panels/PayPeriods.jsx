// Pay-period admin: seed Monday-start weeks, adjust dates, delete
// empty periods. All validation is server-side (no overlap, no gaps,
// Monday starts) — this panel just relays the rejections as toasts.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

export default function PayPeriods() {
  const [periods, setPeriods] = useState(null);
  const [firstMonday, setFirstMonday] = useState('');
  const [weeks, setWeeks] = useState('16');
  const [editing, setEditing] = useState(null); // { id, starting, ending }
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('pay-periods').then((r) => setPeriods(r.periods)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 5000);
  }

  async function post(payload, okMessage) {
    setBusy(true);
    try {
      const r = await apiFetch('pay-periods', { method: 'POST', body: JSON.stringify(payload) });
      setPeriods(r.periods);
      setEditing(null);
      flash(okMessage);
    } catch (e) {
      flash(e.message, true); // the server's blocker message, verbatim
    } finally {
      setBusy(false);
    }
  }

  if (!periods) return <div className="panel center muted">Loading pay periods…</div>;

  return (
    <div className="panel">
      <h1>Pay periods</h1>
      <p className="muted lead">
        Weekly, Monday to Sunday. Periods must be back-to-back — the
        server blocks overlaps and gaps.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Add weeks</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label>First Monday</label>
            <input type="date" value={firstMonday} onChange={(e) => setFirstMonday(e.target.value)} />
          </div>
          <div style={{ width: 110 }}>
            <label>How many weeks</label>
            <input type="number" min="1" max="60" value={weeks} onChange={(e) => setWeeks(e.target.value)} />
          </div>
          <button
            className="btn btn-primary"
            disabled={busy || !firstMonday}
            onClick={() => post({ action: 'seed', firstMonday, weeks: Number(weeks) }, `Created ${weeks} weeks ✓`)}
          >
            Generate weeks
          </button>
        </div>
      </div>

      {periods.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>#</th><th>Period</th><th>Start</th><th>End</th><th>Hours</th><th></th></tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} style={p.isCurrent ? { background: 'var(--gray-50)' } : undefined}>
                  <td>{p.sequence}</td>
                  <td>
                    {p.label} {p.isCurrent && <span className="chip submitted">Current</span>}
                  </td>
                  {editing?.id === p.id ? (
                    <>
                      <td><input type="date" value={editing.starting} onChange={(e) => setEditing({ ...editing, starting: e.target.value })} /></td>
                      <td><input type="date" value={editing.ending} onChange={(e) => setEditing({ ...editing, ending: e.target.value })} /></td>
                      <td>{p.totalHours || 0}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-secondary btn-sm" disabled={busy}
                          onClick={() => post({ action: 'update', id: p.id, starting: editing.starting, ending: editing.ending }, 'Period updated ✓')}>
                          Save
                        </button>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{p.starting}</td>
                      <td>{p.ending}</td>
                      <td>{p.totalHours || 0}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-outline btn-sm" onClick={() => setEditing({ id: p.id, starting: p.starting, ending: p.ending })}>Edit</button>{' '}
                        {p.entryCount === 0 && (
                          <button className="btn btn-ghost btn-sm" disabled={busy}
                            onClick={() => post({ action: 'delete', id: p.id }, 'Period deleted')}>
                            Delete
                          </button>
                        )}
                      </td>
                    </>
                  )}
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
