// Stopwatch timer for logging time as you work — a lean take on
// WorkBase's MultiStopwatch. Named timers, only one running at a time,
// elapsed tracked to the minute. "Log time" submits the accumulated
// minutes as a time entry. Timers persist in localStorage so a
// refresh (or a closed tab) doesn't lose a running timer.

import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api.js';

const CATEGORIES = [
  'Partner Task', 'Partner Meeting', 'Monday Cohort Meeting',
  'Training / Orientation', 'Final Project', 'Field Visit',
  'Independent Learning', 'Other Approved Work',
];
const KEY = 'ngsw_timers_v1';
const today = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 9);

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function persist(timers) {
  try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch { /* private mode */ }
}
// elapsed ms = banked base + (now − runningSince) while running
function elapsedMs(t) {
  return (t.baseMs || 0) + (t.runningSince ? Date.now() - t.runningSince : 0);
}
function fmt(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function Stopwatch() {
  const [timers, setTimers] = useState(load);
  const [tasks, setTasks] = useState([]);
  const [, tick] = useState(0); // re-render every second while running
  const [toast, setToast] = useState(null);
  const busyRef = useRef(false);

  useEffect(() => { apiFetch('my-tasks').then((r) => setTasks(r.tasks)).catch(() => {}); }, []);
  useEffect(() => { persist(timers); }, [timers]);
  useEffect(() => {
    const id = setInterval(() => { if (timers.some((t) => t.runningSince)) tick((n) => n + 1); }, 1000);
    return () => clearInterval(id);
  }, [timers]);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }
  const patch = (id, p) => setTimers((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));

  function addTimer() {
    setTimers((ts) => [...ts, { id: uid(), label: '', category: '', taskId: '', baseMs: 0, runningSince: null }]);
  }

  // Start one timer; bank+pause any other running one (one at a time).
  function start(id) {
    setTimers((ts) => ts.map((t) => {
      if (t.id === id) return { ...t, runningSince: Date.now() };
      if (t.runningSince) return { ...t, baseMs: elapsedMs(t), runningSince: null };
      return t;
    }));
  }
  function pause(id) { patch(id, { baseMs: elapsedMs(timers.find((t) => t.id === id)), runningSince: null }); }
  function reset(id) { patch(id, { baseMs: 0, runningSince: null }); }
  function remove(id) { setTimers((ts) => ts.filter((t) => t.id !== id)); }

  async function log(t) {
    if (busyRef.current) return;
    const minutes = Math.round(elapsedMs(t) / 60000);
    if (minutes <= 0) return flash('Nothing to log yet — let the timer run first', true);
    if (!t.category) return flash('Pick what kind of work this was', true);
    if (t.category === 'Partner Task' && !t.taskId) return flash('Partner task time needs the task selected', true);
    busyRef.current = true;
    try {
      await apiFetch('time-entries', {
        method: 'POST',
        body: JSON.stringify({
          submit: true,
          entries: [{
            date: today(), minutes, category: t.category,
            taskId: t.taskId || undefined, notes: t.label || t.category,
          }],
        }),
      });
      remove(t.id);
      flash(`Logged ${minutes} min for review ✓`);
    } catch (e) {
      flash(e.message, true);
    } finally {
      busyRef.current = false;
    }
  }

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>Stopwatch</h1>
        <button className="btn btn-primary btn-sm" onClick={addTimer}>New timer</button>
      </div>
      <p className="muted lead">
        Start a timer when you begin working. Only one runs at a time.
        When you’re done, “Log time” submits the exact minutes for review.
      </p>

      {timers.length === 0 && (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No timers — add one to start tracking.</p></div>
      )}

      {timers.map((t) => {
        const running = Boolean(t.runningSince);
        return (
          <div className="card" key={t.id} style={running ? { borderLeft: '4px solid var(--leaf)' } : undefined}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontVariantNumeric: 'tabular-nums', fontSize: '1.6rem', fontWeight: 800 }}>
                {fmt(elapsedMs(t))}
              </div>
              <div className="actions" style={{ marginTop: 0 }}>
                {running
                  ? <button className="btn btn-outline btn-sm" onClick={() => pause(t.id)}>Pause</button>
                  : <button className="btn btn-secondary btn-sm" onClick={() => start(t.id)}>Start</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => reset(t.id)}>Reset</button>
                <button className="btn btn-primary btn-sm" onClick={() => log(t)}>Log time</button>
                <button className="row-remove" title="Remove" onClick={() => remove(t.id)}>✕</button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 10 }} className="sw-fields">
              <div>
                <label>What are you working on?</label>
                <input type="text" value={t.label} onChange={(e) => patch(t.id, { label: e.target.value })} placeholder="Short note" />
              </div>
              <div>
                <label>Kind of work</label>
                <select value={t.category} onChange={(e) => patch(t.id, { category: e.target.value })}>
                  <option value="">Choose…</option>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Task (if partner work)</label>
                <select value={t.taskId} onChange={(e) => patch(t.id, { taskId: e.target.value })}>
                  <option value="">None</option>
                  {tasks.map((tk) => <option key={tk.id} value={tk.id}>{tk.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        );
      })}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
