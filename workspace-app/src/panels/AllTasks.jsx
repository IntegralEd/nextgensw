// Coordinator's program-wide task table with the "needs attention"
// lenses from Ava's doc: blocked, overdue, waiting for review.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_CHIP = {
  'Not Started': 'draft',
  'In Progress': 'submitted',
  'Blocked / Need Help': 'returned',
  'Ready for Review': 'ready',
  Complete: 'approved',
};

const todayISO = () => new Date().toISOString().slice(0, 10);
const isOverdue = (t) => t.dueDate && t.status !== 'Complete' && t.dueDate < todayISO();

const LENSES = {
  all: { label: 'All open', test: (t) => t.status !== 'Complete' },
  blocked: { label: 'Blocked', test: (t) => t.status === 'Blocked / Need Help' },
  overdue: { label: 'Overdue', test: isOverdue },
  review: { label: 'Waiting for review', test: (t) => t.status === 'Ready for Review' },
  complete: { label: 'Complete', test: (t) => t.status === 'Complete' },
};

export default function AllTasks() {
  const [tasks, setTasks] = useState(null);
  const [lens, setLens] = useState('all');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('tasks?scope=all').then((r) => setTasks(r.tasks)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  async function archive(id) {
    setBusyId(id);
    try {
      await apiFetch('tasks', { method: 'PATCH', body: JSON.stringify({ id, action: 'archive' }) });
      await load();
      flash('Archived');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusyId(null);
    }
  }

  const counts = useMemo(() => {
    if (!tasks) return {};
    return Object.fromEntries(Object.entries(LENSES).map(([k, l]) => [k, tasks.filter(l.test).length]));
  }, [tasks]);

  if (!tasks) return <div className="panel center muted">Loading all tasks…</div>;

  const list = tasks.filter(LENSES[lens].test);

  return (
    <div className="panel" style={{ maxWidth: 1000 }}>
      <h1>All tasks</h1>

      <div className="guide-list" style={{ marginTop: 10 }}>
        {Object.entries(LENSES).map(([k, l]) => (
          <button key={k} className={k === lens ? 'active' : ''} onClick={() => setLens(k)}>
            {l.label} ({counts[k] ?? 0})
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="muted">Nothing in this view.</p>}

      {list.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Task</th><th>Intern</th><th>From</th><th>Due</th><th>Status</th><th>Review</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.assignedTo || '—'}</td>
                  <td>{t.assignedBy || '—'}</td>
                  <td style={isOverdue(t) ? { color: 'var(--brick)', fontWeight: 700 } : undefined}>
                    {t.dueDate || '—'}
                  </td>
                  <td><span className={`chip ${STATUS_CHIP[t.status] || 'draft'}`}>{t.status}</span></td>
                  <td>{t.reviewStatus || '—'}</td>
                  <td>
                    {t.status === 'Complete' && (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === t.id} onClick={() => archive(t.id)}>
                        Archive
                      </button>
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
