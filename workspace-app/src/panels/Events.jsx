// Program events. Everyone sees their events; opening one shows the
// agenda, materials, attendance (staff can mark it), a quick "log my
// hours for this session" action, and the event's message board.
// Staff get a create form.

import { useEffect, useState } from 'react';
import { apiFetch, currentUser } from '../api.js';

const STAFF = ['Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'];
const todayISO = () => new Date().toISOString().slice(0, 10);

// Event type → the work category hours get logged under.
const TYPE_TO_CATEGORY = {
  'Cohort Session': 'Monday Cohort Meeting',
  'Field Visit': 'Field Visit',
  'Orientation / Training': 'Training / Orientation',
};

export default function Events() {
  const user = currentUser();
  const isStaff = STAFF.includes(user?.role);
  const canLogHours = user?.role !== 'Employer';
  const [data, setData] = useState(null); // { events, cohorts?, eventTypes? }
  const [open, setOpen] = useState(null); // event id
  const [threads, setThreads] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'Cohort Session', date: todayISO(), cohortId: '', locationFormat: 'In-person', location: '', agenda: '', materialsUrl: '' });
  const [attend, setAttend] = useState([]);
  const [logHrs, setLogHrs] = useState('');
  const [post, setPost] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => apiFetch('events').then(setData).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  const ev = data?.events.find((e) => e.id === open) || null;

  async function openEvent(e) {
    setOpen(e.id);
    setAttend(e.attendanceIds);
    setThreads(null);
    setPost('');
    try {
      const r = await apiFetch(`messages?anchor=${e.id}`);
      setThreads(r.threads);
    } catch { setThreads([]); }
  }

  async function createEvent() {
    if (!form.name.trim()) return flash('Give the event a name', true);
    setBusy(true);
    try {
      await apiFetch('events', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false);
      setForm({ ...form, name: '', agenda: '', materialsUrl: '' });
      await load();
      flash('Event created ✓');
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  }

  async function saveAttendance() {
    setBusy(true);
    try {
      await apiFetch('events', { method: 'PATCH', body: JSON.stringify({ id: ev.id, action: 'attendance', userIds: attend }) });
      await load();
      flash('Attendance saved ✓');
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  }

  async function logMyHours() {
    const hours = parseFloat(logHrs);
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return flash('Enter the hours (like 1.5)', true);
    setBusy(true);
    try {
      await apiFetch('time-entries', {
        method: 'POST',
        body: JSON.stringify({
          submit: true,
          entries: [{
            date: ev.date || todayISO(),
            minutes: Math.round(hours * 60),
            category: TYPE_TO_CATEGORY[ev.type] || 'Other Approved Work',
            eventId: ev.id,
            notes: ev.name,
          }],
        }),
      });
      setLogHrs('');
      await load();
      flash('Hours submitted for this event ✓');
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  }

  async function startThread() {
    if (!post.trim()) return;
    setBusy(true);
    try {
      await apiFetch('messages', { method: 'POST', body: JSON.stringify({ action: 'thread', eventId: ev.id, subject: ev.name, content: post }) });
      const r = await apiFetch(`messages?anchor=${ev.id}`);
      setThreads(r.threads);
      setPost('');
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  }

  if (!data) return <div className="panel center muted">Loading events…</div>;

  // ---------- detail ----------
  if (ev) {
    const cohort = data.cohorts?.find((c) => ev.cohortIds.includes(c.id)) ||
      (ev.cohortIds.length ? { id: ev.cohortIds[0] } : null);
    return (
      <div className="panel">
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setOpen(null)}>← All events</button>
        <h1>{ev.name}</h1>
        <p className="muted lead">
          {[ev.type, ev.date, ev.locationFormat, ev.location].filter(Boolean).join(' · ')}
        </p>
        {ev.agenda && (
          <div className="card"><label>Agenda</label><div style={{ whiteSpace: 'pre-wrap' }}>{ev.agenda}</div></div>
        )}
        {ev.materialsUrl && <p><a href={ev.materialsUrl} target="_blank" rel="noreferrer">Session materials ↗</a></p>}

        {canLogHours && (
          <div className="card">
            <label>Log my hours for this event</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="number" min="0.25" step="0.25" placeholder="1.5" style={{ width: 100 }}
                value={logHrs} onChange={(e) => setLogHrs(e.target.value)} />
              <button className="btn btn-secondary btn-sm" disabled={busy} onClick={logMyHours}>Submit hours</button>
            </div>
            <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 0 }}>
              {ev.hoursLogged} {ev.hoursLogged === 1 ? 'entry' : 'entries'} logged against this event so far.
            </p>
          </div>
        )}

        <div className="card">
          <label>Attendance {ev.attendance.length ? `(${ev.attendance.length})` : ''}</label>
          {isStaff ? (
            <>
              <AttendancePicker
                cohort={cohort}
                current={attend}
                onToggle={(id) => setAttend(attend.includes(id) ? attend.filter((x) => x !== id) : [...attend, id])}
              />
              <div className="actions">
                <button className="btn btn-outline btn-sm" disabled={busy} onClick={saveAttendance}>Save attendance</button>
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>{ev.attendance.length ? ev.attendance.join(', ') : 'Not taken yet.'}</p>
          )}
        </div>

        <h2>Discussion</h2>
        <label>Start a topic (visible to the cohort)</label>
        <textarea rows={2} value={post} onChange={(e) => setPost(e.target.value)} placeholder="Prep questions, reflections, follow-ups…" />
        <div className="actions"><button className="btn btn-primary btn-sm" disabled={busy || !post.trim()} onClick={startThread}>Post</button></div>
        {threads === null && <p className="muted">Loading discussion…</p>}
        {threads?.length === 0 && <p className="muted">No discussion yet — start one above.</p>}
        {threads?.map((t) => (
          <div className="card" key={t.id}>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 4 }}>
              <strong style={{ color: 'var(--ink)' }}>{t.author}</strong>
              {t.latestAt ? ` · ${new Date(t.latestAt).toLocaleString()}` : ''}
              {t.replyCount ? ` · ${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'} (open in Inbox)` : ''}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{t.content}</div>
          </div>
        ))}
        {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
      </div>
    );
  }

  // ---------- list ----------
  const upcoming = data.events.filter((e) => !e.date || e.date >= todayISO());
  const past = data.events.filter((e) => e.date && e.date < todayISO());
  const Row = ({ e }) => (
    <div className="card" style={{ cursor: 'pointer' }} onClick={() => openEvent(e)}>
      <strong>{e.name}</strong>
      <div className="muted" style={{ fontSize: '0.9rem' }}>
        {[e.type, e.date, e.locationFormat].filter(Boolean).join(' · ')}
        {e.attendance.length ? ` · ${e.attendance.length} attended` : ''}
      </div>
    </div>
  );

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>Events</h1>
        {isStaff && <button className="btn btn-primary btn-sm" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'New event'}</button>}
      </div>

      {creating && (
        <div className="card">
          <label>Event name</label>
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Monday Session — Oct 8" />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <div>
              <label>Type</label>
              <input type="text" list="event-types" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
              <datalist id="event-types">
                {(data.eventTypes || []).map((t) => <option key={t} value={t} />)}
              </datalist>
            </div>
            <div><label>Date</label><input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
            <div>
              <label>Cohort</label>
              <select value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })}>
                <option value="">None</option>
                {(data.cohorts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label>Format</label>
              <select value={form.locationFormat} onChange={(e) => setForm({ ...form, locationFormat: e.target.value })}>
                <option>In-person</option><option>Virtual</option><option>Hybrid</option>
              </select>
            </div>
          </div>
          <label style={{ marginTop: 10 }}>Location / link</label>
          <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <label style={{ marginTop: 10 }}>Agenda</label>
          <textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          <label style={{ marginTop: 10 }}>Materials link</label>
          <input type="url" value={form.materialsUrl} onChange={(e) => setForm({ ...form, materialsUrl: e.target.value })} />
          <div className="actions"><button className="btn btn-primary" disabled={busy} onClick={createEvent}>Create event</button></div>
        </div>
      )}

      {upcoming.length > 0 && <h2>Upcoming & today</h2>}
      {upcoming.map((e) => <Row e={e} key={e.id} />)}
      {past.length > 0 && <h2>Past</h2>}
      {past.map((e) => <Row e={e} key={e.id} />)}
      {data.events.length === 0 && <p className="muted">No events yet{isStaff ? ' — create the first one.' : '.'}</p>}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}

// Staff attendance picker: the cohort roster as toggle chips (falls
// back to current attendees when the event has no cohort).
function AttendancePicker({ cohort, current, onToggle }) {
  const [people, setPeople] = useState(null);
  useEffect(() => {
    apiFetch('cohorts').then((r) => {
      const c = cohort ? r.cohorts.find((x) => x.id === cohort.id) : null;
      setPeople(c ? c.members : []);
    }).catch(() => setPeople([]));
  }, [cohort?.id]);
  if (people === null) return <p className="muted">Loading roster…</p>;
  if (!people.length) return <p className="muted">Link a cohort to this event to get a roster to check off.</p>;
  return (
    <div className="guide-list">
      {people.map((p) => (
        <button key={p.id} className={current.includes(p.id) ? 'active' : ''} onClick={() => onToggle(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
