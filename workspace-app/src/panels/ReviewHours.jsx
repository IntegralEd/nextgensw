// Coordinator review queue: approve submitted hours or return them
// with a note (which opens a Program+Intern message thread on the
// entry). Oldest submissions first so nothing lingers.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const hrs = (m) => (m / 60).toFixed(m % 60 === 0 ? 0 : 2);

export default function ReviewHours() {
  const [entries, setEntries] = useState(null);
  const [returning, setReturning] = useState(null); // entry id with open comment box
  const [comment, setComment] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('review-hours').then((r) => setEntries(r.entries)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  async function decide(id, action) {
    setBusyId(id);
    try {
      await apiFetch('review-hours', {
        method: 'PATCH',
        body: JSON.stringify({ id, action, comment: action === 'return' ? comment : undefined }),
      });
      setReturning(null);
      setComment('');
      await load();
      flash(action === 'approve' ? 'Approved ✓' : 'Returned to the intern with your note');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusyId(null);
    }
  }

  if (!entries) return <div className="panel center muted">Loading the review queue…</div>;

  return (
    <div className="panel">
      <h1>Review hours</h1>
      <p className="muted lead">
        {entries.length === 0
          ? 'Nothing waiting — the queue is clear.'
          : `${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} waiting for review, oldest first.`}
      </p>

      {entries.map((e) => (
        <div className="card" key={e.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{e.internName}</strong> · {e.date} · {hrs(e.minutes)}h · {e.category}
              {e.notes && <div className="muted" style={{ marginTop: 4 }}>{String(e.notes).replace(/\n+/g, ' ')}</div>}
            </div>
            <div className="actions" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary btn-sm" disabled={busyId === e.id} onClick={() => decide(e.id, 'approve')}>
                Approve
              </button>
              <button
                className="btn btn-outline btn-sm"
                disabled={busyId === e.id}
                onClick={() => { setReturning(returning === e.id ? null : e.id); setComment(''); }}
              >
                Return…
              </button>
            </div>
          </div>
          {returning === e.id && (
            <div style={{ marginTop: 12 }}>
              <label>What should they clarify?</label>
              <textarea
                rows={2}
                value={comment}
                onChange={(ev) => setComment(ev.target.value)}
                placeholder="e.g. Which task was this for? The notes don't match the category."
              />
              <div className="actions">
                <button
                  className="btn btn-primary btn-sm"
                  disabled={busyId === e.id || !comment.trim()}
                  onClick={() => decide(e.id, 'return')}
                >
                  Return with note
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
