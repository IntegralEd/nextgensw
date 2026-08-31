// The workspace homepage: role-aware alert cards over the data that
// already exists (tasks, hours, messages), plus Ava's quick buttons.
// Cards swap the panel in place via the hash — no Softr edits needed.

import { useEffect, useState } from 'react';
import { apiFetch, currentUser } from '../api.js';

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
            s.blocked = r.tasks.filter((t) => t.status === 'Blocked / Need Help').length;
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
                {stats.blocked > 0 && <Card n={stats.blocked} label="interns blocked" accent="var(--brick)" hash="#/all-tasks" />}
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
            <button className="btn btn-secondary" onClick={() => (window.location.hash = isEmployer ? '#/assign-task' : '#/my-tasks')}>
              {isEmployer ? 'Request a task' : 'Update a task'}
            </button>
            <button className="btn btn-outline" onClick={() => (window.location.hash = '#/inbox')}>Ask for help</button>
          </div>
        </>
      )}
    </div>
  );
}
