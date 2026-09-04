// Multi-entry hours logger (WorkBase multientry pattern, simplified).
// Interns add one row per chunk of work — date, hours, category,
// optional task — then save everything as drafts or submit for review
// in one go. Hours are entered as decimals and stored as minutes.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const CATEGORIES = [
  'Partner Task',
  'Partner Meeting',
  'Monday Cohort Meeting',
  'Training / Orientation',
  'Final Project',
  'Field Visit',
  'Independent Learning',
  'Other Approved Work',
];

const today = () => new Date().toISOString().slice(0, 10);
// Time is entered as hours + minutes and stored as exact minutes — no
// rounding to quarter-hours (Ava's ticket).
const blankRow = () => ({ date: today(), hr: '', min: '', category: '', taskId: '', notes: '' });
const rowMinutes = (r) => {
  const hr = parseInt(r.hr, 10) || 0;
  const min = parseInt(r.min, 10) || 0;
  return hr * 60 + min;
};

export default function LogHours() {
  const [rows, setRows] = useState([blankRow()]);
  const [tasks, setTasks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null); // { text, error }

  useEffect(() => {
    apiFetch('my-tasks').then((r) => setTasks(r.tasks)).catch(() => {});
  }, []);

  const update = (i, patch) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i) => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : rs));

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  function validate() {
    for (const [i, r] of rows.entries()) {
      const minutes = rowMinutes(r);
      if (!r.date) return `Row ${i + 1}: pick a date`;
      if (minutes <= 0 || minutes > 24 * 60)
        return `Row ${i + 1}: enter the time worked (hours and/or minutes)`;
      if ((parseInt(r.min, 10) || 0) > 59)
        return `Row ${i + 1}: minutes should be 0–59 (use the hours box for 60+)`;
      if (!r.category) return `Row ${i + 1}: pick what kind of work this was`;
      if (r.category === 'Partner Task' && !r.taskId)
        return `Row ${i + 1}: partner task hours need the task selected`;
    }
    return null;
  }

  async function save(submit) {
    const problem = validate();
    if (problem) return flash(problem, true);
    setBusy(true);
    try {
      const entries = rows.map((r) => ({
        date: r.date,
        minutes: rowMinutes(r),
        category: r.category,
        taskId: r.taskId || undefined,
        notes: r.notes,
      }));
      await apiFetch('time-entries', { method: 'POST', body: JSON.stringify({ entries, submit }) });
      setRows([blankRow()]);
      flash(
        submit
          ? `Submitted ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} for review ✓`
          : `Saved ${entries.length} draft${entries.length === 1 ? '' : 's'} — submit them from My Hours when ready`
      );
    } catch (err) {
      flash(err.message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel">
      <h1>Log hours</h1>
      <p className="muted lead">
        One row per chunk of work. Add rows to log several days at once.
      </p>

      {rows.map((r, i) => (
        <div className="entry-row" key={i}>
          <div>
            <label>Date</label>
            <input type="date" value={r.date} max={today()} onChange={(e) => update(i, { date: e.target.value })} />
          </div>
          <div className="hm">
            <div>
              <label>Hrs</label>
              <input type="number" min="0" max="24" step="1" placeholder="1"
                value={r.hr} onChange={(e) => update(i, { hr: e.target.value })} />
            </div>
            <div>
              <label>Min</label>
              <input type="number" min="0" max="59" step="1" placeholder="30"
                value={r.min} onChange={(e) => update(i, { min: e.target.value })} />
            </div>
          </div>
          <div>
            <label>Kind of work</label>
            <select value={r.category} onChange={(e) => update(i, { category: e.target.value })}>
              <option value="">Choose…</option>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label>Task (if partner work)</label>
            <select value={r.taskId} onChange={(e) => update(i, { taskId: e.target.value })}>
              <option value="">None</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <button className="row-remove" title="Remove row" onClick={() => remove(i)} disabled={rows.length === 1}>✕</button>
          <div className="notes">
            <label>What did you work on?</label>
            <input
              type="text" placeholder="A sentence is plenty"
              value={r.notes} onChange={(e) => update(i, { notes: e.target.value })}
            />
          </div>
        </div>
      ))}

      <div className="actions">
        <button className="btn btn-outline btn-sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          + Add another row
        </button>
      </div>
      <div className="actions">
        <button className="btn btn-primary" disabled={busy} onClick={() => save(true)}>
          Submit for review
        </button>
        <button className="btn btn-outline" disabled={busy} onClick={() => save(false)}>
          Save as draft
        </button>
      </div>

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
