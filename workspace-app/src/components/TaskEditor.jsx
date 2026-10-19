// Inline editor for a task: staff, the requester, or the requesting
// partner org (the server re-checks — tasks.mjs 'edit' / 'delete').
// Delete takes the task's discussion with it and is refused when real
// hours are logged against it (archive instead).

import { useState } from 'react';
import { apiFetch } from '../api.js';

const EST = ['', '15 Minutes', '30 Minutes', '1 Hour', '2 Hours', '4 Hours', '8 hours'];

export default function TaskEditor({ task, onDone, onCancel, flash }) {
  const [f, setF] = useState({
    name: task.name || '',
    description: task.description || '',
    doneLooksLike: task.doneLooksLike || '',
    dueDate: task.dueDate || '',
    estHours: task.estHours || '',
    priority: task.priority || '',
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function save() {
    if (!f.name.trim()) return flash('The task needs a title', true);
    setBusy(true);
    try {
      await apiFetch('tasks', { method: 'PATCH', body: JSON.stringify({ id: task.id, action: 'edit', fields: f }) });
      flash('Task updated ✓');
      onDone();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try {
      await apiFetch('tasks', { method: 'PATCH', body: JSON.stringify({ id: task.id, action: 'delete' }) });
      flash('Task deleted');
      onDone();
    } catch (e) { flash(e.message, true); setConfirmDelete(false); } finally { setBusy(false); }
  }

  return (
    <div className="card" style={{ background: 'var(--gray-50)' }}>
      <label>Title</label>
      <input type="text" value={f.name} onChange={set('name')} />
      <label style={{ marginTop: 10 }}>What to do</label>
      <textarea rows={3} value={f.description} onChange={set('description')} />
      <label style={{ marginTop: 10 }}>Done looks like</label>
      <textarea rows={2} value={f.doneLooksLike} onChange={set('doneLooksLike')} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        <div><label>Due</label><input type="date" value={f.dueDate} onChange={set('dueDate')} /></div>
        <div>
          <label>Estimated time</label>
          <select value={f.estHours} onChange={set('estHours')}>
            {EST.map((x) => <option key={x} value={x}>{x || '—'}</option>)}
          </select>
        </div>
        <div>
          <label>Priority</label>
          <select value={f.priority} onChange={set('priority')}>
            <option value="">—</option><option>Low</option><option>Medium</option><option>High</option>
          </select>
        </div>
      </div>
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Save changes</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
        <span style={{ flex: 1 }} />
        {!confirmDelete ? (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete task…</button>
        ) : (
          <>
            <span className="muted" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>Delete it and its discussion?</span>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={remove}>Yes, delete</button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirmDelete(false)}>Keep it</button>
          </>
        )}
      </div>
    </div>
  );
}
