// Guided task requests — open to every workspace role (teammates
// request of each other, interns of the team, employers of their
// interns). Each prompt from Ava's requirements doc is its own field,
// so "write clear assignments" is built in rather than a training ask.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const blank = {
  name: '', description: '', doneLooksLike: '', internId: '',
  dueDate: '', estHours: '', priority: 'Medium', links: '', skillAreaId: '',
};

export default function AssignTask() {
  const [meta, setMeta] = useState(null); // { interns, skillAreas }
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiFetch('tasks?scope=partner')
      .then((r) => setMeta({ interns: r.interns, skillAreas: r.skillAreas }))
      .catch((e) => flash(e.message, true));
  }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4500);
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function create() {
    if (!f.name.trim()) return flash('Give the task a short title', true);
    if (!f.internId) return flash('Pick who it\'s for', true);
    if (!f.description.trim()) return flash('Describe what they should do', true);
    if (!f.doneLooksLike.trim()) return flash('Say what “done” looks like — it’s the difference between a clear task and a confusing one', true);
    setBusy(true);
    try {
      await apiFetch('tasks', {
        method: 'POST',
        body: JSON.stringify({ ...f, estHours: f.estHours ? Number(f.estHours) : undefined }),
      });
      setF(blank);
      flash('Task requested ✓ — it\'s now in their task list');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  if (!meta) return <div className="panel center muted">Loading…</div>;

  return (
    <div className="panel">
      <h1>Request a task</h1>
      <p className="muted lead">
        A clear request answers four questions: what to do, what done
        looks like, when it's due, and who to ask. The form walks you
        through them. Anyone can request a task of anyone on the program.
      </p>

      <div className="card">
        <label>Task title</label>
        <input type="text" value={f.name} onChange={set('name')} placeholder="Short and specific — e.g. Draft the October volunteer email" />

        <label style={{ marginTop: 12 }}>Who is it for?</label>
        <select value={f.internId} onChange={set('internId')}>
          <option value="">Choose a person…</option>
          {meta.interns.map((i) => <option key={i.id} value={i.id}>{i.name}{i.role ? ` (${i.role})` : ''}</option>)}
        </select>

        <label style={{ marginTop: 12 }}>What should they do?</label>
        <textarea rows={3} value={f.description} onChange={set('description')} placeholder="The steps or the ask, in plain language." />

        <label style={{ marginTop: 12 }}>What does “done” look like?</label>
        <textarea rows={2} value={f.doneLooksLike} onChange={set('doneLooksLike')} placeholder="e.g. A one-page draft in our shared folder, ready for me to edit." />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12 }}>
          <div>
            <label>When is it due?</label>
            <input type="date" value={f.dueDate} onChange={set('dueDate')} />
          </div>
          <div style={{ width: 120 }}>
            <label>About how long?</label>
            <input type="number" min="0.5" step="0.5" placeholder="hours" value={f.estHours} onChange={set('estHours')} />
          </div>
          <div>
            <label>Priority</label>
            <select value={f.priority} onChange={set('priority')}>
              <option>Low</option><option>Medium</option><option>High</option>
            </select>
          </div>
        </div>

        <label style={{ marginTop: 12 }}>Link to resources (optional)</label>
        <input type="url" value={f.links} onChange={set('links')} placeholder="https://…" />

        <label style={{ marginTop: 12 }}>What skill does this build? (optional)</label>
        <select value={f.skillAreaId} onChange={set('skillAreaId')}>
          <option value="">Choose a skill area…</option>
          {meta.skillAreas.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <div className="actions">
          <button className="btn btn-primary" disabled={busy} onClick={create}>Request task</button>
        </div>
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          You'll be listed as the contact if they get stuck.
        </p>
      </div>

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
