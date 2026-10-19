// The workspace homepage: role-aware alert cards over the data that
// already exists (tasks, hours, messages), plus Ava's quick buttons.
// Cards swap the panel in place via the hash — no Softr edits needed.

import { useEffect, useState } from 'react';
import { apiFetch, currentUser, getShowTest, setShowTest } from '../api.js';
import WhatsNew from '../components/WhatsNew.jsx';

const STAFF = ['Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'];
const todayISO = () => new Date().toISOString().slice(0, 10);

function startOfWeekMonday() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

function Card({ n, label, accent, hash }) {
  return (
    <button
      className="card"
      onClick={() => { if (hash) window.location.hash = hash; }}
      style={{
        cursor: hash ? 'pointer' : 'default', textAlign: 'left', border: '1px solid var(--gray-200)',
        font: 'inherit', flex: '1 1 150px', minWidth: 140,
        borderTop: `4px solid ${accent || 'var(--gray-200)'}`,
      }}
    >
      <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>{n}</div>
      <div className="muted" style={{ fontSize: '0.9rem' }}>{label}</div>
    </button>
  );
}

export default function Home() {
  const user = currentUser();
  const isStaff = STAFF.includes(user?.role);
  const isEmployer = user?.role === 'Employer';
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const s = {};
      const jobs = [];
      jobs.push(
        apiFetch('messages').then((r) => { s.unread = r.threads.filter((t) => t.unread).length; }).catch(() => {})
      );
      if (isEmployer) {
        jobs.push(
          apiFetch('tasks?scope=partner').then((r) => {
            s.awaitingReview = r.tasks.filter((t) => t.status === 'Ready for Review').length;
            s.activeTasks = r.tasks.filter((t) => !['Complete'].includes(t.status)).length;
          }).catch(() => {})
        );
      } else {
        jobs.push(
          apiFetch('tasks?scope=mine').then((r) => {
            const open = r.tasks.filter((t) => t.status !== 'Complete');
            s.openTasks = open.length;
            s.overdue = open.filter((t) => t.dueDate && t.dueDate < todayISO()).length;
            const week = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
            s.dueSoon = open.filter((t) => t.dueDate && t.dueDate >= todayISO() && t.dueDate <= week).length;
          }).catch(() => {}),
          apiFetch('time-entries').then((r) => {
            const monday = startOfWeekMonday();
            s.hoursThisWeek = Math.round(
              r.entries.filter((e) => e.date >= monday && e.status !== 'Draft')
                .reduce((sum, e) => sum + (e.minutes || 0), 0) / 6
            ) / 10;
            s.returned = r.entries.filter((e) => e.status === 'Returned for Clarification').length;
            s.drafts = r.entries.filter((e) => e.status === 'Draft').length;
          }).catch(() => {})
        );
      }
      if (isStaff) {
        jobs.push(
          apiFetch('tasks?scope=all').then((r) => {
            s.blocked = r.tasks.filter((t) => t.status === 'Need Help').length;
            s.readyReview = r.tasks.filter((t) => t.status === 'Ready for Review').length;
          }).catch(() => {}),
          apiFetch('review-hours').then((r) => { s.hoursQueue = r.entries.length; }).catch(() => {})
        );
      }
      await Promise.all(jobs);
      setStats(s);
    })();
  }, []);

  const firstName = (user?.fullName || '').split(' ')[0] || 'there';

  return (
    <div className="panel">
      <h1>Welcome, {firstName}</h1>
      <WhatsNew emptyText="You're all caught up." />

      {!stats && <p className="muted">Checking what needs your attention…</p>}

      {stats && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
            {stats.unread !== undefined && (
              <Card n={stats.unread} label="new messages" accent="var(--potomac)" hash="#/inbox" />
            )}
            {!isEmployer && (
              <>
                <Card n={stats.openTasks ?? 0} label="open tasks" accent="var(--leaf)" hash="#/my-tasks" />
                {stats.overdue > 0 && <Card n={stats.overdue} label="overdue tasks" accent="var(--brick)" hash="#/my-tasks" />}
                {stats.dueSoon > 0 && <Card n={stats.dueSoon} label="due in the next week" accent="var(--yellow)" hash="#/my-tasks" />}
                <Card n={stats.hoursThisWeek ?? 0} label="hours logged this week" accent="var(--leaf)" hash="#/my-hours" />
                {stats.returned > 0 && <Card n={stats.returned} label="hours returned — needs you" accent="var(--brick)" hash="#/my-hours" />}
                {stats.drafts > 0 && <Card n={stats.drafts} label="draft hours not submitted" accent="var(--gray-500)" hash="#/my-hours" />}
              </>
            )}
            {isEmployer && (
              <>
                <Card n={stats.awaitingReview ?? 0} label="waiting for your review" accent="var(--yellow)" hash="#/partner-tasks" />
                <Card n={stats.activeTasks ?? 0} label="active tasks" accent="var(--leaf)" hash="#/partner-tasks" />
              </>
            )}
            {isStaff && (
              <>
                {stats.blocked > 0 && <Card n={stats.blocked} label="interns need help" accent="var(--brick)" hash="#/all-tasks" />}
                <Card n={stats.readyReview ?? 0} label="tasks ready for review" accent="var(--yellow)" hash="#/all-tasks" />
                <Card n={stats.hoursQueue ?? 0} label="hours to review" accent="var(--potomac)" hash="#/review-hours" />
              </>
            )}
          </div>

          <h2>Quick actions</h2>
          <div className="actions">
            {!isEmployer && (
              <button className="btn btn-primary" onClick={() => (window.location.hash = '#/log-hours')}>Log hours</button>
            )}
            {/* Staff jump to the program-wide All tasks view (was three
                buttons all landing on My tasks in testing); interns update
                their own; employers request. */}
            <button
              className="btn btn-secondary"
              onClick={() => (window.location.hash = isStaff ? '#/all-tasks' : isEmployer ? '#/assign-task' : '#/my-tasks')}
            >
              {isStaff ? 'All tasks' : isEmployer ? 'Request a task' : 'Update a task'}
            </button>
            <button className="btn btn-outline" onClick={() => (window.location.hash = '#/inbox')}>Send a message</button>
          </div>
          {isStaff && <TestDataCard />}
        </>
      )}
    </div>
  );
}

// Staff: the test sandbox at a glance. "Show test data" mixes test rows
// into your views (payroll exports still leave them out); admins can
// clear every test task, timesheet, event and message in one go — the
// test accounts stay for the next demo.
function TestDataCard() {
  const [info, setInfo] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);
  const show = getShowTest();
  const load = () => apiFetch('test-data').then(setInfo).catch(() => setInfo(null));
  useEffect(() => { load(); }, []);
  if (!info) return null;
  const c = info.counts;
  const total = c.tasks + c.timeEntries + c.events + c.messages;

  async function clear() {
    setBusy(true); setNote(null);
    try {
      const r = await apiFetch('test-data', { method: 'POST', body: JSON.stringify({ action: 'clear' }) });
      const d = r.deleted;
      setNote(`Cleared ${d.tasks} tasks, ${d.timeEntries} timesheet entries, ${d.events} events and ${d.messages} messages.`);
      await load();
    } catch (e) { setNote(`Couldn't clear: ${e.message}`); } finally { setBusy(false); setConfirming(false); }
  }

  return (
    <>
      <h2>Test accounts & demo data</h2>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Test accounts ({info.accounts.map((a) => a.role).join(', ') || 'none'}) work in a sandbox: real interns,
          partners, reports and payroll never see what they do.
          {' '}{total ? `Right now: ${c.tasks} tasks, ${c.timeEntries} timesheet entries, ${c.events} events, ${c.messages} messages.` : 'No test data right now.'}
        </p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={show}
            onChange={(e) => { setShowTest(e.target.checked); window.location.reload(); }} />
          Show test data in my views
        </label>
        {info.canClear && total > 0 && (
          <div className="actions">
            {!confirming ? (
              <button className="btn btn-outline btn-sm" onClick={() => setConfirming(true)}>Clear test data…</button>
            ) : (
              <>
                <span className="muted" style={{ alignSelf: 'center', fontSize: '0.85rem' }}>Delete all {total} test rows? Real data is untouched.</span>
                <button className="btn btn-primary btn-sm" disabled={busy} onClick={clear}>Yes, clear it</button>
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
              </>
            )}
          </div>
        )}
        {note && <p className="muted" style={{ marginBottom: 0 }}>{note}</p>}
      </div>
    </>
  );
}
