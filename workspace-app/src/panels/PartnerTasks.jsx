// The employer's task view: work waiting for their review first, then
// everything active with their intern(s). Accept or request updates —
// requests require a note (which the intern sees on the task thread).

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_CHIP = {
  'Not Started': 'draft',
  'In Progress': 'submitted',
  'Blocked / Need Help': 'returned',
  'Ready for Review': 'ready',
  Complete: 'approved',
};

export default function PartnerTasks() {
  const [tasks, setTasks] = useState(null);
  const [reviewing, setReviewing] = useState(null);
  const [comment, setComment] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('tasks?scope=partner').then((r) => setTasks(r.tasks)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  async function review(id, decision) {
    setBusyId(id);
    try {
      await apiFetch('tasks', {
        method: 'PATCH',
        body: JSON.stringify({ id, action: 'review', decision, comment }),
      });
      setReviewing(null); setComment('');
      await load();
      flash(decision === 'accept' ? 'Accepted — nice work all around ✓' : 'Sent back with your note');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusyId(null);
    }
  }

  if (!tasks) return <div className="panel center muted">Loading tasks…</div>;

  const waiting = tasks.filter((t) => t.status === 'Ready for Review');
  const active = tasks.filter((t) => !['Ready for Review', 'Complete'].includes(t.status));
  const done = tasks.filter((t) => t.status === 'Complete');

  const TaskCard = ({ t, reviewable }) => (
    <div className="card" key={t.id}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong>{t.name}</strong>
          <div className="muted" style={{ fontSize: '0.9rem', marginTop: 2 }}>
            {t.assignedTo}{t.dueDate ? ` · due ${t.dueDate}` : ''}
          </div>
          {t.submittedWorkUrl && (
            <a href={t.submittedWorkUrl} target="_blank" rel="noreferrer">View submitted work ↗</a>
          )}
        </div>
        <span className={`chip ${STATUS_CHIP[t.status] || 'draft'}`}>{t.status}</span>
      </div>
      {reviewable && (
        <>
          <div className="actions">
            <button className="btn btn-secondary btn-sm" disabled={busyId === t.id} onClick={() => review(t.id, 'accept')}>
              Accept work
            </button>
            <button className="btn btn-outline btn-sm" disabled={busyId === t.id}
              onClick={() => { setReviewing(reviewing === t.id ? null : t.id); setComment(''); }}>
              Request updates…
            </button>
          </div>
          {reviewing === t.id && (
            <div style={{ marginTop: 10 }}>
              <label>What should they update?</label>
              <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
                placeholder="Be specific — it goes straight to the intern." />
              <div className="actions">
                <button className="btn btn-primary btn-sm" disabled={busyId === t.id || !comment.trim()}
                  onClick={() => review(t.id, 'request-updates')}>
                  Send back with note
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="panel">
      <h1>Your intern's tasks</h1>
      <p className="muted lead">
        {waiting.length
          ? `${waiting.length} ${waiting.length === 1 ? 'task' : 'tasks'} waiting for your review.`
          : 'Nothing waiting for review right now.'}
      </p>

      {waiting.length > 0 && <h2>Waiting for your review</h2>}
      {waiting.map((t) => <TaskCard t={t} reviewable key={t.id} />)}

      {active.length > 0 && <h2>Active</h2>}
      {active.map((t) => <TaskCard t={t} key={t.id} />)}

      {done.length > 0 && <h2>Complete</h2>}
      {done.map((t) => <TaskCard t={t} key={t.id} />)}

      {tasks.length === 0 && (
        <div className="card">
          <p className="muted" style={{ margin: 0 }}>
            No tasks yet — use <strong>Assign a task</strong> to create the first one.
          </p>
        </div>
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
