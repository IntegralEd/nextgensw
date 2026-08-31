// Cohort administration (staff): create cohorts, manage the member
// roster, set the Active cohort (only one at a time — the server
// completes any other), and fan a task out to every intern member.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

export default function CohortAdmin() {
  const [data, setData] = useState(null); // { cohorts, people }
  const [newName, setNewName] = useState('');
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [editing, setEditing] = useState(null); // cohort id whose roster is open
  const [memberSel, setMemberSel] = useState([]);
  const [fanFor, setFanFor] = useState(null); // cohort id with fan-out form open
  const [fan, setFan] = useState({ name: '', description: '', doneLooksLike: '', dueDate: '', estHours: '', priority: 'Medium' });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const load = () => apiFetch('cohorts').then(setData).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4500);
  }

  async function act(payload, ok) {
    setBusy(true);
    try {
      await apiFetch('cohorts', { method: 'POST', body: JSON.stringify(payload) });
      await load();
      flash(ok);
      return true;
    } catch (e) {
      flash(e.message, true);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="panel center muted">Loading cohorts…</div>;

  return (
    <div className="panel">
      <h1>Cohorts</h1>
      <p className="muted lead">
        The cohort is the program's roster — events, cohort-wide tasks,
        and announcements all point at it. Only one is Active at a time.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>New cohort</h2>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 160px' }}>
            <label>Name</label>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Fall 2026" />
          </div>
          <div><label>Starts</label><input type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} /></div>
          <div><label>Ends</label><input type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} /></div>
          <button className="btn btn-primary" disabled={busy || !newName.trim()}
            onClick={async () => {
              if (await act({ action: 'create', name: newName, startDate: newStart, endDate: newEnd }, 'Cohort created ✓')) {
                setNewName(''); setNewStart(''); setNewEnd('');
              }
            }}>
            Create
          </button>
        </div>
      </div>

      {data.cohorts.map((c) => (
        <div className="card" key={c.id}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{c.name}</strong>{' '}
              {c.status === 'Active'
                ? <span className="chip approved">Active</span>
                : <span className="chip draft">{c.status}</span>}
              <div className="muted" style={{ fontSize: '0.9rem', marginTop: 2 }}>
                {[c.startDate && `${c.startDate} → ${c.endDate || '…'}`, `${c.members.length} members`, c.coordinator && `coordinator: ${c.coordinator}`]
                  .filter(Boolean).join(' · ')}
              </div>
            </div>
            <div className="actions" style={{ marginTop: 0 }}>
              {c.status !== 'Active' && (
                <button className="btn btn-secondary btn-sm" disabled={busy}
                  onClick={() => act({ action: 'status', id: c.id, status: 'Active' }, `${c.name} is now the Active cohort`)}>
                  Make Active
                </button>
              )}
              <button className="btn btn-outline btn-sm"
                onClick={() => { setEditing(editing === c.id ? null : c.id); setMemberSel(c.memberIds); }}>
                Members
              </button>
              <button className="btn btn-outline btn-sm"
                onClick={() => { setFanFor(fanFor === c.id ? null : c.id); }}>
                Assign to all
              </button>
            </div>
          </div>

          {editing === c.id && (
            <div style={{ marginTop: 12 }}>
              <label>Roster — click to add/remove</label>
              <div className="guide-list">
                {data.people.map((p) => (
                  <button key={p.id} className={memberSel.includes(p.id) ? 'active' : ''}
                    onClick={() => setMemberSel(memberSel.includes(p.id) ? memberSel.filter((x) => x !== p.id) : [...memberSel, p.id])}>
                    {p.name} ({p.role})
                  </button>
                ))}
              </div>
              <div className="actions">
                <button className="btn btn-secondary btn-sm" disabled={busy}
                  onClick={async () => {
                    const coordinatorId = data.people.find((p) => memberSel.includes(p.id) && p.role === 'Coordinator')?.id;
                    if (await act({ action: 'members', id: c.id, memberIds: memberSel, coordinatorId }, 'Roster saved ✓')) setEditing(null);
                  }}>
                  Save roster
                </button>
              </div>
            </div>
          )}

          {fanFor === c.id && (
            <div style={{ marginTop: 12 }}>
              <label>Task title (goes to every intern in {c.name})</label>
              <input type="text" value={fan.name} onChange={(e) => setFan({ ...fan, name: e.target.value })}
                placeholder="e.g. Weekly reflection — what did you learn?" />
              <label style={{ marginTop: 8 }}>What should they do?</label>
              <textarea rows={2} value={fan.description} onChange={(e) => setFan({ ...fan, description: e.target.value })} />
              <label style={{ marginTop: 8 }}>What does done look like?</label>
              <textarea rows={2} value={fan.doneLooksLike} onChange={(e) => setFan({ ...fan, doneLooksLike: e.target.value })} />
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
                <div><label>Due</label><input type="date" value={fan.dueDate} onChange={(e) => setFan({ ...fan, dueDate: e.target.value })} /></div>
                <div style={{ width: 110 }}><label>Est. hours</label><input type="number" min="0.25" step="0.25" value={fan.estHours} onChange={(e) => setFan({ ...fan, estHours: e.target.value })} /></div>
                <div>
                  <label>Priority</label>
                  <select value={fan.priority} onChange={(e) => setFan({ ...fan, priority: e.target.value })}>
                    <option>Low</option><option>Medium</option><option>High</option>
                  </select>
                </div>
              </div>
              <div className="actions">
                <button className="btn btn-primary btn-sm" disabled={busy || !fan.name.trim()}
                  onClick={async () => {
                    if (await act({ action: 'fanout', cohortId: c.id, ...fan, estHours: fan.estHours ? Number(fan.estHours) : undefined },
                      'Assigned to every intern in the cohort ✓')) {
                      setFanFor(null);
                      setFan({ name: '', description: '', doneLooksLike: '', dueDate: '', estHours: '', priority: 'Medium' });
                    }
                  }}>
                  Assign to all interns
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
