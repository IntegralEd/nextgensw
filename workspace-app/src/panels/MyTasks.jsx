// The intern's task list. Cards grouped by urgency (blocked and
// in-progress first), with the assignment details expandable and the
// three actions Ava's doc asks for: update status, ask for help
// (= Blocked), and submit work.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_CHIP = {
  'Not Started': 'draft',
  'In Progress': 'submitted',
  'Blocked / Need Help': 'returned',
  'Ready for Review': 'ready',
  Complete: 'approved',
};
const GROUP_ORDER = ['Blocked / Need Help', 'In Progress', 'Not Started', 'Ready for Review', 'Complete'];

const isOverdue = (t) =>
  t.dueDate && t.status !== 'Complete' && t.dueDate < new Date().toISOString().slice(0, 10);

export default function MyTasks() {
  const [tasks, setTasks] = useState(null);
  const [open, setOpen] = useState(null); // expanded task id
  const [submitFor, setSubmitFor] = useState(null); // task id with submit form open
  const [workUrl, setWorkUrl] = useState('');
  const [workNote, setWorkNote] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('tasks?scope=mine').then((r) => setTasks(r.tasks)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  async function patch(id, payload, okMsg) {
    setBusyId(id);
    try {
      await apiFetch('tasks', { method: 'PATCH', body: JSON.stringify({ id, ...payload }) });
      setSubmitFor(null); setWorkUrl(''); setWorkNote('');
      await load();
      flash(okMsg);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusyId(null);
    }
  }

  if (!tasks) return <div className="panel center muted">Loading your tasks…</div>;

  const grouped = GROUP_ORDER.map((g) => [g, tasks.filter((t) => t.status === g)]).filter(([, list]) => list.length);

  return (
    <div className="panel">
      <h1>My tasks</h1>
      <p className="muted lead">
        {tasks.length === 0
          ? 'No tasks assigned yet — they’ll appear here when your partner or coordinator assigns one.'
          : `${tasks.filter((t) => t.status !== 'Complete').length} open, ${tasks.filter(isOverdue).length} overdue.`}
      </p>

      {grouped.map(([group, list]) => (
        <div key={group}>
          <h2>{group}</h2>
          {list.map((t) => (
            <div className="card" key={t.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div>
                  <strong>{t.name}</strong>
                  <div className="muted" style={{ fontSize: '0.9rem', marginTop: 2 }}>
                    {t.dueDate ? (
                      <span style={isOverdue(t) ? { color: 'var(--brick)', fontWeight: 700 } : undefined}>
                        due {t.dueDate}{isOverdue(t) ? ' — overdue' : ''}
                      </span>
                    ) : 'no due date'}
                    {' · '}from {t.assignedBy || '—'}
                    {t.estHours ? ` · ~${t.estHours}h` : ''}
                    {t.priority ? ` · ${t.priority} priority` : ''}
                  </div>
                </div>
                <span className={`chip ${STATUS_CHIP[t.status] || 'draft'}`}>{t.status}</span>
              </div>

              <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setOpen(open === t.id ? null : t.id)}>
                {open === t.id ? 'Hide details' : 'Details & actions'}
              </button>

              {open === t.id && (
                <div>
                  {t.description && (
                    <>
                      <label>What to do</label>
                      <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{t.description}</p>
                    </>
                  )}
                  {t.doneLooksLike && (
                    <>
                      <label>What done looks like</label>
                      <p style={{ whiteSpace: 'pre-wrap', marginTop: 0 }}>{t.doneLooksLike}</p>
                    </>
                  )}
                  {t.links && <p><a href={t.links} target="_blank" rel="noreferrer">Task resources ↗</a></p>}
                  {t.askIfStuck && <p className="muted">Stuck? Ask {t.askIfStuck}.</p>}
                  {t.reviewStatus === 'Updates Requested' && (
                    <p style={{ color: 'var(--brick)', fontWeight: 600 }}>Updates requested — check the reviewer's note, then resubmit.</p>
                  )}

                  {t.status !== 'Complete' && (
                    <div className="actions">
                      {t.status !== 'In Progress' && (
                        <button className="btn btn-outline btn-sm" disabled={busyId === t.id}
                          onClick={() => patch(t.id, { action: 'status', status: 'In Progress' }, 'Marked in progress')}>
                          {t.status === 'Not Started' ? 'Start task' : 'Back to in progress'}
                        </button>
                      )}
                      {t.status !== 'Blocked / Need Help' && (
                        <button className="btn btn-outline btn-sm" disabled={busyId === t.id}
                          onClick={() => patch(t.id, { action: 'status', status: 'Blocked / Need Help' }, 'Flagged — your coordinator will see this')}>
                          I'm stuck / need help
                        </button>
                      )}
                      <button className="btn btn-secondary btn-sm" disabled={busyId === t.id}
                        onClick={() => setSubmitFor(submitFor === t.id ? null : t.id)}>
                        Submit work…
                      </button>
                    </div>
                  )}

                  {submitFor === t.id && (
                    <div style={{ marginTop: 10 }}>
                      <label>Link to your work (doc, file, folder…)</label>
                      <input type="url" placeholder="https://…" value={workUrl} onChange={(e) => setWorkUrl(e.target.value)} />
                      <label style={{ marginTop: 8 }}>Anything the reviewer should know?</label>
                      <input type="text" value={workNote} onChange={(e) => setWorkNote(e.target.value)} placeholder="Optional note" />
                      <div className="actions">
                        <button className="btn btn-primary btn-sm" disabled={busyId === t.id}
                          onClick={() => patch(t.id, { action: 'submit-work', url: workUrl, note: workNote }, 'Submitted for review ✓')}>
                          Submit for review
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
