// Coordinator timesheet review. Browse all submitted hours, filter by
// review state and who's commented, and either mark reviewed (bulk
// too), add a comment, or — admins only — approve for payroll. The
// coordinator's review is separate from payroll approval.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api.js';

const hrs = (m) => (m / 60).toFixed(m % 60 === 0 ? 0 : 2);
const REVIEW_CHIP = { New: 'draft', 'Open Comment': 'returned', Approved: 'approved' };
const REVIEW_STATES = ['New', 'Open Comment', 'Approved'];
const COMMENTER_ROLES = ['Partner', 'Coordinator', 'Intern'];

export default function ReviewHours() {
  const [entries, setEntries] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reviewF, setReviewF] = useState(['New', 'Open Comment']); // default: needs attention
  const [commenterF, setCommenterF] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [commenting, setCommenting] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('review-hours').then((r) => { setEntries(r.entries); setIsAdmin(r.isAdmin); })
      .catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  const toggle = (arr, set) => (v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const shown = useMemo(() => {
    if (!entries) return [];
    return entries.filter(
      (e) =>
        (!reviewF.length || reviewF.includes(e.coordinatorReview)) &&
        (!commenterF.length || commenterF.some((r) => e.commenterRoles.includes(r)))
    );
  }, [entries, reviewF, commenterF]);

  async function act(payload, okMsg) {
    setBusy(true);
    try {
      await apiFetch('review-hours', { method: 'PATCH', body: JSON.stringify(payload) });
      setCommenting(null); setComment(''); setSelected(new Set());
      await load();
      flash(okMsg);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  const selectableShown = shown.map((e) => e.id);
  const allSelected = selectableShown.length > 0 && selectableShown.every((id) => selected.has(id));
  const toggleSel = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectableShown));

  if (!entries) return <div className="panel center muted">Loading the review queue…</div>;

  return (
    <div className="panel" style={{ maxWidth: 1000 }}>
      <h1>Review hours</h1>
      <p className="muted lead">
        Your review is separate from payroll — marking hours reviewed or
        commenting doesn’t change payroll status.
      </p>

      <div className="card">
        <div style={{ marginBottom: 8 }}>
          <label>Review state</label>
          <div className="guide-list" style={{ marginBottom: 0 }}>
            {REVIEW_STATES.map((s) => (
              <button key={s} className={reviewF.includes(s) ? 'active' : ''} onClick={() => toggle(reviewF, setReviewF)(s)}>{s}</button>
            ))}
          </div>
        </div>
        <div>
          <label>Has a comment from</label>
          <div className="guide-list" style={{ marginBottom: 0 }}>
            {COMMENTER_ROLES.map((r) => (
              <button key={r} className={commenterF.includes(r) ? 'active' : ''} onClick={() => toggle(commenterF, setCommenterF)(r)}>{r}</button>
            ))}
          </div>
        </div>
        {selected.size > 0 && (
          <div className="actions">
            <button className="btn btn-secondary btn-sm" disabled={busy}
              onClick={() => act({ action: 'review', ids: [...selected] }, `Marked ${selected.size} reviewed ✓`)}>
              Mark {selected.size} reviewed
            </button>
            {isAdmin && (
              <button className="btn btn-primary btn-sm" disabled={busy}
                onClick={() => act({ action: 'payroll-approve', ids: [...selected] }, `Approved ${selected.size} for payroll ✓`)}>
                Approve {selected.size} for payroll
              </button>
            )}
          </div>
        )}
      </div>

      <p className="muted" style={{ fontSize: '0.85rem' }}>
        {shown.length} of {entries.length} shown.{' '}
        {shown.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={toggleAll}>
            {allSelected ? 'Clear selection' : 'Select all shown'}
          </button>
        )}
      </p>

      {shown.length === 0 && <p className="muted">Nothing matches these filters.</p>}

      {shown.map((e) => (
        <div className="card" key={e.id}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggleSel(e.id)} style={{ width: 'auto', marginTop: 4 }} />
            <div style={{ flex: 1, minWidth: 200 }}>
              <strong>{e.internName}</strong> · {e.date} · {hrs(e.minutes)}h · {e.category}
              <div className="muted" style={{ fontSize: '0.85rem', marginTop: 2 }}>
                <span className={`chip ${REVIEW_CHIP[e.coordinatorReview] || 'draft'}`}>{e.coordinatorReview}</span>
                {' '}payroll: {e.status}
                {e.submittedAt ? ` · submitted ${new Date(e.submittedAt).toLocaleString()}` : ''}
                {e.commenterRoles.length ? ` · comments: ${e.commenterRoles.join(', ')}` : ''}
              </div>
              {e.notes && <div className="muted" style={{ marginTop: 4 }}>{String(e.notes).replace(/\n+/g, ' ')}</div>}
            </div>
            <div className="actions" style={{ marginTop: 0 }}>
              <button className="btn btn-secondary btn-sm" disabled={busy}
                onClick={() => act({ action: 'review', id: e.id }, 'Marked reviewed ✓')}>
                Mark reviewed
              </button>
              <button className="btn btn-outline btn-sm" disabled={busy}
                onClick={() => { setCommenting(commenting === e.id ? null : e.id); setComment(''); }}>
                💬 Add a comment
              </button>
              {isAdmin && e.status !== 'Approved' && (
                <button className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => act({ action: 'payroll-approve', id: e.id }, 'Approved for payroll ✓')}>
                  Approve for payroll
                </button>
              )}
            </div>
          </div>
          {commenting === e.id && (
            <div style={{ marginTop: 12 }}>
              <label>Comment to the intern</label>
              <textarea rows={2} value={comment} onChange={(ev) => setComment(ev.target.value)}
                placeholder="e.g. Which task was this for? The notes don't match the category." />
              <div className="actions">
                <button className="btn btn-primary btn-sm" disabled={busy || !comment.trim()}
                  onClick={() => act({ action: 'comment', id: e.id, comment }, 'Comment sent to the intern')}>
                  Send comment
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
