// Program events. Everyone sees every event; opening one shows the
// agenda, materials, attendance (staff and the hosting partner org can
// mark it), a quick "log my hours for this session" action, and the
// event's message board. Staff and employers get a create form: staff
// events attach to a cohort, employer events are hosted by their org
// and default to Optional attendance.

import { useEffect, useState } from 'react';
import { apiFetch, currentUser } from '../api.js';

const STAFF = ['Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'];
const todayISO = () => new Date().toISOString().slice(0, 10);
const hashParam = (k) => new URLSearchParams(window.location.hash.split('?')[1] || '').get(k);

// Event type → the work category hours get logged under.
const TYPE_TO_CATEGORY = {
  'Cohort Session': 'Monday Cohort Meeting',
  'Field Visit': 'Field Visit',
  'Orientation / Training': 'Training / Orientation',
};

export default function Events() {
  const user = currentUser();
  const isStaff = STAFF.includes(user?.role);
  const isEmployer = user?.role === 'Employer';
  const canCreate = isStaff || isEmployer;
  const canLogHours = !isEmployer;
  const [data, setData] = useState(null); // { events, cohorts?, orgs?, eventTypes? }
  const [open, setOpen] = useState(null); // event id
  const [threads, setThreads] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '', date: todayISO(), cohortId: '', orgId: '', locationFormat: 'In-person', location: '', agenda: '', materialsUrl: '',
    type: isEmployer ? 'Partner Event' : 'Cohort Session',
    attendanceType: isEmployer ? 'Optional' : 'Required',
  });
  const [attend, setAttend] = useState([]);
  const [logHrs, setLogHrs] = useState('');
  const [post, setPost] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [editingEv, setEditingEv] = useState(false);

  const load = () => apiFetch('events').then(setData).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);
  // Deep link from the What's new card: #/events?open=recX (once).
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked || !data) return;
    const e = data.events.find((x) => x.id === hashParam('open'));
    setDeepLinked(true);
    if (e) openEvent(e);
  }, [data]);
  // …and later clicks on the card while already on this page.
  useEffect(() => {
    const onHash = () => {
      const e = data?.events.find((x) => x.id === hashParam('open'));
      if (e) openEvent(e);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [data]);
  // Employers host for their own org; preselect it once the meta lands.
  useEffect(() => {
    if (isEmployer && data?.orgs?.length && !form.orgId) setForm((f) => ({ ...f, orgId: data.orgs[0].id }));
  }, [data]);

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

  async function toggleAttendanceType() {
    const attendanceType = ev.attendanceType === 'Optional' ? 'Required' : 'Optional';
    setBusy(true);
    try {
      await apiFetch('events', { method: 'PATCH', body: JSON.stringify({ id: ev.id, action: 'update', fields: { attendanceType } }) });
      await load();
      flash(`Attendance is now ${attendanceType.toLowerCase()} ✓`);
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
    // Who can be checked off: the cohort roster, else the host org's
    // assigned interns, else whoever is already marked.
    const cohort = data.cohorts?.find((c) => ev.cohortIds.includes(c.id));
    const org = data.orgs?.find((o) => ev.partnerOrgIds.includes(o.id));
    const people = cohort?.members || org?.members || [];
    return (
      <div className="panel">
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => { setOpen(null); setEditingEv(false); }}>← All events</button>
        <h1>{ev.name}{ev.isTest && <> <span className="chip test">Test</span></>}</h1>
        <p className="muted lead">
          {[ev.type, ev.date, ev.locationFormat, ev.location].filter(Boolean).join(' · ')}
          {' '}<span className={`chip ${ev.attendanceType === 'Optional' ? 'draft' : 'returned'}`}>{ev.attendanceType}</span>
          {ev.hostOrgs.length > 0 && <> · Hosted by {ev.hostOrgs.join(', ')}</>}
        </p>
        {ev.canEdit && !editingEv && (
          <div className="actions" style={{ marginTop: 0 }}>
            <button className="btn btn-outline btn-sm" onClick={() => setEditingEv(true)}>Edit event</button>
          </div>
        )}
        {ev.canEdit && editingEv && (
          <EventEditor ev={ev} types={data.eventTypes || []} flash={flash}
            onCancel={() => setEditingEv(false)}
            onSaved={async () => { setEditingEv(false); await load(); }}
            onDeleted={async () => { setEditingEv(false); setOpen(null); await load(); }} />
        )}
        {ev.canEdit && (
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: -4 }}>
            Attendance is {ev.attendanceType.toLowerCase()} —{' '}
            <button className="btn btn-ghost btn-sm" style={{ padding: 0 }} disabled={busy} onClick={toggleAttendanceType}>
              make it {ev.attendanceType === 'Optional' ? 'required' : 'optional'}
            </button>
          </p>
        )}
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
          {ev.canEdit ? (
            <>
              <AttendancePicker
                people={people}
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
        <label>Start a topic (visible to everyone in the workspace)</label>
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
      <strong>{e.name}</strong>{e.isTest && <> <span className="chip test">Test</span></>}
      <div className="muted" style={{ fontSize: '0.9rem' }}>
        {[e.type, e.date, e.locationFormat].filter(Boolean).join(' · ')}
        {' '}<span className={`chip ${e.attendanceType === 'Optional' ? 'draft' : 'returned'}`}>{e.attendanceType}</span>
        {e.hostOrgs.length ? ` · ${e.hostOrgs.join(', ')}` : ''}
        {e.attendance.length ? ` · ${e.attendance.length} attended` : ''}
      </div>
    </div>
  );

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>Events</h1>
        {canCreate && <button className="btn btn-primary btn-sm" onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : 'New event'}</button>}
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
            {isStaff && (
              <div>
                <label>Cohort</label>
                <select value={form.cohortId} onChange={(e) => setForm({ ...form, cohortId: e.target.value })}>
                  <option value="">None</option>
                  {(data.cohorts || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            {(data.orgs || []).length > 0 && (
              <div>
                <label>{isEmployer ? 'Hosted by' : 'Partner org'}</label>
                <select value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })}>
                  {isStaff && <option value="">None</option>}
                  {data.orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>
            )}
            <div>
              <label>Format</label>
              <select value={form.locationFormat} onChange={(e) => setForm({ ...form, locationFormat: e.target.value })}>
                <option>In-person</option><option>Virtual</option><option>Hybrid</option>
              </select>
            </div>
            <div>
              <label>Attendance</label>
              <select value={form.attendanceType} onChange={(e) => setForm({ ...form, attendanceType: e.target.value })}>
                {isEmployer ? <><option>Optional</option><option>Required</option></> : <><option>Required</option><option>Optional</option></>}
              </select>
            </div>
          </div>
          <label style={{ marginTop: 10 }}>Location / link</label>
          <input type="text" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <label style={{ marginTop: 10 }}>Agenda</label>
          <textarea rows={3} value={form.agenda} onChange={(e) => setForm({ ...form, agenda: e.target.value })} />
          <label style={{ marginTop: 10 }}>Materials link</label>
          <input type="url" value={form.materialsUrl} onChange={(e) => setForm({ ...form, materialsUrl: e.target.value })} />
          {isEmployer && (
            <p className="muted" style={{ fontSize: '0.85rem' }}>
              Your event shows on every intern's Events page and program staff get a heads-up in their inbox.
              Required events count toward the weekly attendance report, so leave Optional unless it's part of the internship.
            </p>
          )}
          <div className="actions"><button className="btn btn-primary" disabled={busy} onClick={createEvent}>Create event</button></div>
        </div>
      )}

      {upcoming.length > 0 && <h2>Upcoming & today</h2>}
      {upcoming.map((e) => <Row e={e} key={e.id} />)}
      {past.length > 0 && <h2>Past</h2>}
      {past.map((e) => <Row e={e} key={e.id} />)}
      {data.events.length === 0 && <p className="muted">No events yet{canCreate ? ' — create the first one.' : '.'}</p>}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}

// Edit / delete an event (staff or the hosting partner org; the server
// re-checks). Delete takes the event's discussion with it and is
// refused when real hours are logged against it.
function EventEditor({ ev, types, flash, onCancel, onSaved, onDeleted }) {
  const [f, setF] = useState({
    name: ev.name || '', type: ev.type || '', date: ev.date || '', attendanceType: ev.attendanceType || 'Required',
    locationFormat: ev.locationFormat || 'In-person', location: ev.location || '', agenda: ev.agenda || '', materialsUrl: ev.materialsUrl || '',
  });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    if (!f.name.trim()) return flash('Give the event a name', true);
    setBusy(true);
    try {
      await apiFetch('events', { method: 'PATCH', body: JSON.stringify({ id: ev.id, action: 'update', fields: f }) });
      flash('Event updated ✓');
      await onSaved();
    } catch (e) { flash(e.message, true); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try {
      await apiFetch('events', { method: 'PATCH', body: JSON.stringify({ id: ev.id, action: 'delete' }) });
      flash('Event deleted');
      await onDeleted();
    } catch (e) { flash(e.message, true); setConfirmDelete(false); } finally { setBusy(false); }
  }
  return (
    <div className="card" style={{ background: 'var(--gray-50)' }}>
      <label>Event name</label>
      <input type="text" value={f.name} onChange={set('name')} />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
        <div>
          <label>Type</label>
          <input type="text" list="event-types-edit" value={f.type} onChange={set('type')} />
          <datalist id="event-types-edit">{types.map((t) => <option key={t} value={t} />)}</datalist>
        </div>
        <div><label>Date</label><input type="date" value={f.date} onChange={set('date')} /></div>
        <div>
          <label>Format</label>
          <select value={f.locationFormat} onChange={set('locationFormat')}><option>In-person</option><option>Virtual</option><option>Hybrid</option></select>
        </div>
        <div>
          <label>Attendance</label>
          <select value={f.attendanceType} onChange={set('attendanceType')}><option>Required</option><option>Optional</option></select>
        </div>
      </div>
      <label style={{ marginTop: 10 }}>Location / link</label>
      <input type="text" value={f.location} onChange={set('location')} />
      <label style={{ marginTop: 10 }}>Agenda</label>
      <textarea rows={3} value={f.agenda} onChange={set('agenda')} />
      <label style={{ marginTop: 10 }}>Materials link</label>
      <input type="url" value={f.materialsUrl} onChange={set('materialsUrl')} />
      <div className="actions">
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={save}>Save changes</button>
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>Cancel</button>
        <span style={{ flex: 1 }} />
        {!confirmDelete ? (
          <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirmDelete(true)}>Delete event…</button>
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

// Attendance picker: the roster (cohort members or the host org's
// assigned interns, resolved by the caller) as toggle chips.
function AttendancePicker({ people, current, onToggle }) {
  if (!people.length) return <p className="muted">No roster yet — link a cohort, or assign interns to the hosting organization, to get people to check off.</p>;
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
