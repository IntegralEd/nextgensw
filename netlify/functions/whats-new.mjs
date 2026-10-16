// netlify/functions/whats-new.mjs
//
// The "What's new" card's feed (docs/WHATS_NEW_PROPOSAL.md), adapted
// from WorkBase's api/whats-new.js. Answers: what changed for me since
// I last clicked Got it, and what should I do about it?
//
//   GET  → { asOf, since, items: [...] } for the caller's role
//   POST { action:'seen', asOf, dismiss?: [reminderId] }
//        → Users.Whats_New_Seen_At = asOf; reminder ids appended to
//          Users.Whats_New_Dismissed (last 40 kept)
//
// Two kinds of item:
//   "new since"  — changes after the cursor; Got it moves the cursor.
//   reminders    — time windows (pay week closing, event tomorrow…)
//                  keyed by a stable id; Got it silences that id only.
//
// Item: { id, kind, tone, title, detail?, entries: [{ id, label, meta?,
//         hash? | url? }], more, cta: { label, hash } | null,
//         checklist?: 'mark-reviewed', reminder?: true }
// tone: 'urgent' (brick) | 'review' (yellow) | 'reminder' (potomac) |
//       'info' (gray). Items come back ordered by tone, then kind.
//
// No write paths beyond the cursor: the coordinator checklist calls the
// existing review-hours 'review' action. Visibility of messages comes
// from the inbox's own rules (_lib/visibility.mjs).

import {
  env,
  TABLES,
  STAFF_ROLES,
  airtableGet,
  airtableWrite,
  fetchUserMap,
  requireAuth,
  corsHeaders,
  json,
} from './_lib/workspace.mjs';
import { scanAll, buildContext, rootVisible } from './_lib/visibility.mjs';

const ADMIN_ROLES = ['Admin', 'SuperAdmin', 'Super Admin'];
const SUPER_ROLES = ['SuperAdmin', 'Super Admin'];
const DAY = 86400000;
const DEFAULT_LOOKBACK_DAYS = 7;
const MAX_LOOKBACK_DAYS = 14;
const ENTRY_CAP = 8;
const CHECKLIST_CAP = 50;
const DISMISSED_KEEP = 40;
const TICKETS_TABLE = 'Tickets';
const TICKETS_PAGE = 'https://nextgensw.softr.app/tickets';

const TONE_ORDER = ['urgent', 'review', 'reminder', 'info'];
const KIND_ORDER = [
  'hours.fix', 'tasks.needhelp', 'flagged', 'payroll.ready',
  'tasks.review', 'hours.review',
  'pp.submit', 'event.soon', 'attendance.missing', 'hours.under', 'tasks.slow',
  'tasks.assigned', 'tasks.feedback', 'replies', 'event.discussion', 'employer.activity',
  'hours.approved', 'payroll.finalized', 'events.new', 'tickets', 'messages',
];

// ---------- small helpers ----------
const iso = (d) => d.toISOString().slice(0, 10);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const after = (ts, since) => Boolean(ts) && ts > since;
const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, day] = d.split('-').map(Number);
  return `${m}/${day}`;
};
const hoursOf = (entries) =>
  Math.round(entries.reduce((s, r) => s + (Number(r.fields?.['Minutes']) || 0), 0) / 6) / 10;
const short = (s, n = 80) => {
  const t = String(s || '').replace(/[*_#`>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
// Stable short hash for a set of ids (reminder ids that should re-fire
// when the set changes, e.g. a new stale task joins the list).
const hashIds = (ids) => {
  let h = 0;
  for (const c of [...ids].sort().join(',')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
};

function item(kind, tone, title, rows, extra = {}) {
  const list = rows || [];
  const cap = extra.checklist ? CHECKLIST_CAP : ENTRY_CAP;
  return {
    id: extra.id || kind,
    kind,
    tone,
    title,
    detail: extra.detail || null,
    entries: list.slice(0, cap),
    more: Math.max(0, list.length - cap),
    cta: extra.cta || null,
    ...(extra.checklist ? { checklist: extra.checklist } : {}),
    ...(extra.reminder ? { reminder: true } : {}),
  };
}

// The pay period containing `day` (Mon–Sun weeks).
const periodFor = (periods, day) =>
  periods.find((p) => p.fields?.['Starting'] <= day && day <= p.fields?.['Ending']) || null;
// Review close: the admin-set date, else two days after the week ends.
const closeOf = (p) => {
  const f = p.fields || {};
  if (f['Payroll_Review_Close']) return f['Payroll_Review_Close'];
  const d = new Date(`${f['Ending']}T12:00:00Z`);
  return iso(new Date(d.getTime() + 2 * DAY));
};
const daysBefore = (dateStr, n) => iso(new Date(new Date(`${dateStr}T12:00:00Z`).getTime() - n * DAY));
const inRange = (p, d) => d >= p.fields['Starting'] && d <= p.fields['Ending'];

// ---------- the feed ----------
async function buildFeed(cfg, auth, me, users, since, nowIso) {
  const role = auth.role;
  const isStaff = STAFF_ROLES.includes(role);
  const isAdmin = ADMIN_ROLES.includes(role);
  const isEmployer = role === 'Employer';
  const isIntern = role === 'Intern';
  const today = nowIso.slice(0, 10);
  const name = (id) => users[id]?.name || users[id]?.email || '?';
  const names = (ids) => (ids || []).map(name).join(', ');
  const roleOf = (id) => users[id]?.role || null;

  const lookback35 = iso(new Date(Date.now() - 35 * DAY));
  const [tasks, entries, events, periods, roots, recentMsgs] = await Promise.all([
    scanAll(cfg, TABLES.TASKS, { filterByFormula: `{Status} != 'Archived'` }),
    isEmployer
      ? []
      : scanAll(cfg, TABLES.TIME_ENTRIES, {
          filterByFormula: isStaff
            ? `AND({Status} != 'Draft', {Date_Worked} >= '${lookback35}')`
            : `{Intern_Record_ID} = '${auth.uid}'`,
        }),
    scanAll(cfg, TABLES.EVENTS),
    isEmployer ? [] : scanAll(cfg, TABLES.PAY_PERIOD, { filterByFormula: `{Ending} >= '${lookback35}'` }),
    scanAll(cfg, TABLES.MESSAGES, { filterByFormula: 'NOT({Is_Reply})' }),
    scanAll(cfg, TABLES.MESSAGES, { filterByFormula: `IS_AFTER({Created_Datetime}, '${since}')` }),
  ]);

  const ctx = buildContext(auth, me, { tasks, entries, events });
  const rootById = new Map(roots.map((r) => [r.id, r]));
  const visibleRoot = (r) => r && rootVisible(r.fields || {}, auth, ctx);
  const items = [];

  const taskRow = (t, meta) => ({
    id: t.id,
    label: t.fields?.['Task_Name'] || '(untitled task)',
    meta,
    hash: isStaff ? '#/all-tasks' : isEmployer ? '#/partner-tasks' : '#/my-tasks',
  });
  const eventRow = (e, meta) => ({
    id: e.id,
    label: e.fields?.['Event_Name'] || '(untitled event)',
    meta,
    hash: `#/events?open=${e.id}`,
  });
  const threadRow = (root, meta, label) => ({
    id: root.id,
    label: label || root.fields?.['Subject'] || short(root.fields?.['Message_Content'], 60) || '(message)',
    meta,
    hash: `#/inbox?thread=${root.id}`,
  });
  const entryRow = (r, meta) => ({
    id: r.id,
    label: `${fmtDate(r.fields?.['Date_Worked'])} · ${Math.round((Number(r.fields?.['Minutes']) || 0) / 6) / 10}h${
      isStaff ? ` · ${names(r.fields?.['Intern'])}` : ''
    }`,
    meta: short(r.fields?.['Notes'], 60) || r.fields?.['Work_Category'] || null,
    hash: isStaff ? '#/review-hours' : '#/my-hours',
  });

  // Events relevant to an intern for Required reminders: their cohort,
  // their org's, or program-wide (no cohort, no org).
  const myCohorts = new Set(me['Cohorts'] || []);
  const myOrgs = me['Partner_Org'] || [];
  const eventIsMine = (e) => {
    const f = e.fields || {};
    const c = f['Cohort'] || [], o = f['Partner_Org'] || [];
    if (!c.length && !o.length) return true;
    return c.some((x) => myCohorts.has(x)) || o.some((x) => myOrgs.includes(x));
  };

  // ============ Interns ============
  if (isIntern) {
    const mine = entries; // already filtered to the caller

    // Hours need a fix — returned or commented, since last look.
    const needFix = mine.filter((r) => {
      const f = r.fields || {};
      return f['Status'] === 'Returned for Clarification' || f['Coordinator_Review'] === 'Open Comment';
    });
    const newFix = needFix.filter((r) => after(r.fields?.['Reviewed_At'], since) || after(r.fields?.['Last_Reviewed'], since));
    if (newFix.length) {
      items.push(item('hours.fix', 'urgent',
        needFix.length === 1 ? '1 timesheet needs your attention' : `${needFix.length} timesheets need your attention`,
        needFix.map((r) => entryRow(r, r.fields?.['Status'] === 'Returned for Clarification' ? 'Returned' : 'Coordinator comment')),
        { cta: { label: 'Open My hours', hash: '#/my-hours' } }));
    }

    const myTasks = tasks.filter((t) => (t.fields?.['Assigned_To'] || []).includes(auth.uid));

    const assigned = myTasks.filter((t) => after(t.fields?.['Created'], since)
      && !(t.fields?.['Assigned_By'] || []).includes(auth.uid)
      && t.fields?.['Status'] !== 'Complete');
    if (assigned.length) {
      items.push(item('tasks.assigned', 'info', `${plural(assigned.length, 'new task')} for you`,
        assigned.map((t) => taskRow(t, [`from ${names(t.fields?.['Assigned_By'])}`, t.fields?.['Due_Date'] && `due ${fmtDate(t.fields['Due_Date'])}`].filter(Boolean).join(' · '))),
        { cta: { label: 'Open My tasks', hash: '#/my-tasks' } }));
    }

    const feedback = myTasks.filter((t) =>
      after(t.fields?.['Review_Changed_At'], since) && ['Accepted', 'Updates Requested'].includes(t.fields?.['Review_Status']));
    if (feedback.length) {
      items.push(item('tasks.feedback', 'info', `Feedback on ${plural(feedback.length, 'task')}`,
        feedback.map((t) => taskRow(t, t.fields['Review_Status'] === 'Accepted' ? 'Accepted ✓' : 'Updates requested')),
        { cta: { label: 'Open My tasks', hash: '#/my-tasks' } }));
    }

    // Submit your hours — Friday of the pay week through review close.
    const expected = Number(me['Weekly_Expected_Hours']) || 0;
    for (const p of periods) {
      const f = p.fields || {};
      if (f['Payroll_Finalized']) continue;
      const opens = daysBefore(f['Ending'], 2); // Friday of a Mon–Sun week
      const close = closeOf(p);
      if (today < opens || today > close) continue;
      const inP = mine.filter((r) => inRange(p, r.fields?.['Date_Worked'] || ''));
      const drafts = inP.filter((r) => r.fields?.['Status'] === 'Draft');
      const logged = hoursOf(inP.filter((r) => r.fields?.['Status'] !== 'Draft'));
      const under = expected > 0 && logged < expected;
      if (!drafts.length && !under) continue;
      const bits = [];
      if (drafts.length) bits.push(`${plural(drafts.length, 'draft')} not submitted`);
      if (under) bits.push(`${logged} of ${expected} expected hours logged`);
      items.push(item('pp.submit', 'reminder',
        `Payroll review closes ${fmtDate(close)} — make sure your hours for ${fmtDate(f['Starting'])}–${fmtDate(f['Ending'])} are in`,
        [], { id: `pp-submit:${p.id}`, reminder: true, detail: bits.join(' · '), cta: { label: 'Log hours', hash: '#/log-hours' } }));
    }

    // Required event today or tomorrow.
    const tomorrow = iso(new Date(Date.now() + DAY));
    for (const e of events) {
      const f = e.fields || {};
      if ((f['Attendance_Type'] || 'Required') !== 'Required') continue;
      if (!f['Event_Date'] || f['Event_Date'] < today || f['Event_Date'] > tomorrow) continue;
      if (!eventIsMine(e)) continue;
      items.push(item('event.soon', 'reminder',
        `Required: ${f['Event_Name'] || 'event'} ${f['Event_Date'] === today ? 'today' : 'tomorrow'}`,
        [eventRow(e, [f['Location_Format'], f['Location']].filter(Boolean).join(' · ') || null)],
        { id: `event-soon:${e.id}`, reminder: true }));
    }

    const approved = mine.filter((r) => r.fields?.['Status'] === 'Approved' && after(r.fields?.['Reviewed_At'], since));
    if (approved.length) {
      items.push(item('hours.approved', 'info', `${hoursOf(approved)} hours approved for payroll`,
        approved.map((r) => entryRow(r, null)), { cta: { label: 'Open My hours', hash: '#/my-hours' } }));
    }
  }

  // ============ Employers ============
  if (isEmployer) {
    const related = tasks.filter((t) => {
      const f = t.fields || {};
      return (f['Assigned_By'] || []).includes(auth.uid) || (f['Partner_Org'] || []).some((o) => myOrgs.includes(o));
    });
    const stuck = related.filter((t) => t.fields?.['Status'] === 'Need Help' && after(t.fields?.['Status_Changed_At'], since));
    if (stuck.length) {
      items.push(item('tasks.needhelp', 'urgent', `${plural(stuck.length, 'task')} marked Need Help`,
        stuck.map((t) => taskRow(t, names(t.fields?.['Assigned_To']))),
        { cta: { label: 'Open Task review', hash: '#/partner-tasks' } }));
    }
    const waiting = related.filter((t) => t.fields?.['Status'] === 'Ready for Review');
    if (waiting.some((t) => after(t.fields?.['Status_Changed_At'], since))) {
      items.push(item('tasks.review', 'review', `${plural(waiting.length, 'task')} ready for your review`,
        waiting.map((t) => taskRow(t, names(t.fields?.['Assigned_To']))),
        { cta: { label: 'Open Task review', hash: '#/partner-tasks' } }));
    }
    // Discussion on events my org hosts.
    const hosted = new Set(events.filter((e) => (e.fields?.['Partner_Org'] || []).some((o) => myOrgs.includes(o))).map((e) => e.id));
    const byEvent = new Map();
    for (const m of recentMsgs) {
      const f = m.fields || {};
      if ((f['Author'] || []).includes(auth.uid)) continue;
      const root = f['Thread_Root_ID'] ? rootById.get(f['Thread_Root_ID']) : m;
      const evId = root?.fields?.['Event']?.[0];
      if (!evId || !hosted.has(evId) || !visibleRoot(root)) continue;
      byEvent.set(evId, (byEvent.get(evId) || 0) + 1);
    }
    if (byEvent.size) {
      const evs = events.filter((e) => byEvent.has(e.id));
      const total = [...byEvent.values()].reduce((a, b) => a + b, 0);
      items.push(item('event.discussion', 'info', `${plural(total, 'new post')} on your organization's events`,
        evs.map((e) => eventRow(e, plural(byEvent.get(e.id), 'post')))));
    }
  }

  // ============ Coordinators & admins ============
  if (isStaff) {
    const stuck = tasks.filter((t) => t.fields?.['Status'] === 'Need Help');
    if (stuck.some((t) => after(t.fields?.['Status_Changed_At'], since))) {
      items.push(item('tasks.needhelp', 'urgent', `${plural(stuck.length, 'task')} marked Need Help`,
        stuck.map((t) => taskRow(t, names(t.fields?.['Assigned_To']))),
        { cta: { label: 'Open All tasks', hash: '#/all-tasks' } }));
    }

    const flagged = recentMsgs.filter((m) => m.fields?.['Flag_For_Supervisor'] === true && !(m.fields?.['Author'] || []).includes(auth.uid));
    if (flagged.length) {
      items.push(item('flagged', 'urgent', `${plural(flagged.length, 'message')} flagged for a supervisor`,
        flagged.map((m) => {
          const root = m.fields?.['Thread_Root_ID'] ? rootById.get(m.fields['Thread_Root_ID']) || m : m;
          return threadRow(root, `from ${names(m.fields?.['Author'])}`, short(m.fields?.['Message_Content'], 70));
        })));
    }

    // Timesheets to review — checklist, reuses review-hours 'review'.
    const queue = entries
      .filter((r) => r.fields?.['Status'] === 'Submitted' && !['Approved', 'Open Comment'].includes(r.fields?.['Coordinator_Review']))
      .sort((a, b) => String(b.fields?.['Submitted_At'] || '').localeCompare(String(a.fields?.['Submitted_At'] || '')));
    if (queue.some((r) => after(r.fields?.['Submitted_At'], since) || after(r.fields?.['Created'], since))) {
      items.push(item('hours.review', 'review', `${plural(queue.length, 'timesheet')} to review`,
        queue.map((r) => entryRow(r, short(r.fields?.['Notes'], 50) || r.fields?.['Work_Category'] || null)),
        { checklist: 'mark-reviewed', cta: { label: 'Open Review timesheets', hash: '#/review-hours' } }));
    }

    // Intern replies on threads staff started (comments on hours/tasks).
    const replies = recentMsgs.filter((m) => {
      const f = m.fields || {};
      if (!f['Thread_Root_ID'] || roleOf(f['Author']?.[0]) !== 'Intern') return false;
      const root = rootById.get(f['Thread_Root_ID']);
      return root && STAFF_ROLES.includes(roleOf(root.fields?.['Author']?.[0]));
    });
    if (replies.length) {
      items.push(item('replies', 'info', `${plural(replies.length, 'intern reply', 'intern replies')} to staff comments`,
        replies.map((m) => threadRow(rootById.get(m.fields['Thread_Root_ID']), `from ${names(m.fields?.['Author'])}`))));
    }

    // Attendance not taken on a Required event in the last 3 days.
    const threeAgo = iso(new Date(Date.now() - 3 * DAY));
    for (const e of events) {
      const f = e.fields || {};
      if ((f['Attendance_Type'] || 'Required') !== 'Required') continue;
      if (!f['Event_Date'] || f['Event_Date'] >= today || f['Event_Date'] < threeAgo) continue;
      if ((f['Attendance'] || []).length) continue;
      items.push(item('attendance.missing', 'reminder', `Attendance not taken: ${f['Event_Name'] || 'event'} (${fmtDate(f['Event_Date'])})`,
        [eventRow(e, null)], { id: `attendance:${e.id}`, reminder: true }));
    }

    // Under expected hours — Thursday of the pay week through close.
    const internIds = Object.keys(users).filter((id) => users[id].role === 'Intern');
    let expected = null;
    for (const p of periods) {
      const f = p.fields || {};
      if (f['Payroll_Finalized']) continue;
      const close = closeOf(p);
      if (today < daysBefore(f['Ending'], 3) || today > close) continue;
      expected = expected || (await expectedHours(cfg, internIds));
      const under = [];
      for (const id of internIds) {
        const exp = expected[id] || 0;
        if (!exp) continue;
        const logged = hoursOf(entries.filter((r) => (r.fields?.['Intern'] || []).includes(id) && inRange(p, r.fields?.['Date_Worked'] || '')));
        if (logged < exp) under.push({ id, label: name(id), meta: `${logged} of ${exp} hours`, hash: '#/reports' });
      }
      if (under.length) {
        items.push(item('hours.under', 'reminder',
          `${plural(under.length, 'intern is', 'interns are')} under expected hours for ${fmtDate(f['Starting'])}–${fmtDate(f['Ending'])}`,
          under, { id: `under:${p.id}:${hashIds(under.map((u) => u.id))}`, reminder: true, cta: { label: 'Open Reports', hash: '#/reports' } }));
      }
    }

    // Partner review is slow — waiting on an employer more than 3 days.
    const slow = tasks.filter((t) => {
      const f = t.fields || {};
      return f['Status'] === 'Ready for Review' && f['Status_Changed_At'] && f['Status_Changed_At'] < new Date(Date.now() - 3 * DAY).toISOString()
        && roleOf(f['Assigned_By']?.[0]) === 'Employer';
    });
    if (slow.length) {
      items.push(item('tasks.slow', 'reminder', `${plural(slow.length, 'task has', 'tasks have')} waited on a partner's review for 3+ days`,
        slow.map((t) => taskRow(t, `${names(t.fields?.['Assigned_By'])} · since ${fmtDate(t.fields['Status_Changed_At'].slice(0, 10))}`)),
        { id: `slow:${hashIds(slow.map((t) => t.id))}`, reminder: true }));
    }

    // Employer activity — tasks employers requested and partner events.
    const empTasks = tasks.filter((t) => after(t.fields?.['Created'], since) && roleOf(t.fields?.['Assigned_By']?.[0]) === 'Employer');
    const partnerEvents = events.filter((e) => after(e.fields?.['Created'], since) && (e.fields?.['Partner_Org'] || []).length);
    if (empTasks.length || partnerEvents.length) {
      const parts = [];
      if (empTasks.length) parts.push(plural(empTasks.length, 'task'));
      if (partnerEvents.length) parts.push(plural(partnerEvents.length, 'event'));
      const orgName = await orgNames(cfg);
      items.push(item('employer.activity', 'info', `Employers added ${parts.join(' and ')}`, [
        ...partnerEvents.map((e) => eventRow(e, [
          (e.fields['Partner_Org'] || []).map((o) => orgName[o] || '?').join(', '),
          e.fields['Event_Date'] && fmtDate(e.fields['Event_Date']),
          e.fields['Attendance_Type'] || 'Required',
        ].filter(Boolean).join(' · '))),
        ...empTasks.map((t) => taskRow(t, [
          `${names(t.fields?.['Assigned_By'])} → ${names(t.fields?.['Assigned_To'])}`,
          t.fields?.['Due_Date'] && `due ${fmtDate(t.fields['Due_Date'])}`,
        ].filter(Boolean).join(' · '))),
      ]));
    }
  }

  // ============ Admins: the payroll cycle ============
  if (isAdmin) {
    for (const p of periods) {
      const f = p.fields || {};
      if (f['Payroll_Finalized'] || f['Ending'] >= today) continue;
      const inP = entries.filter((r) => r.fields?.['Status'] === 'Submitted' && inRange(p, r.fields?.['Date_Worked'] || ''));
      if (!inP.length) continue;
      const reviewed = inP.filter((r) => r.fields?.['Coordinator_Review'] === 'Approved').length;
      const close = f['Payroll_Review_Close'];
      const soon = close && close <= iso(new Date(Date.now() + DAY));
      items.push(item('payroll.ready', soon ? 'urgent' : 'review',
        `Payroll for ${fmtDate(f['Starting'])}–${fmtDate(f['Ending'])} is ready to finalize`, [], {
          id: `payroll:${p.id}`,
          reminder: true,
          detail: `${plural(inP.length, 'entry', 'entries')} submitted · ${reviewed} coordinator-reviewed · ${inP.length - reviewed} not yet`
            + (close ? ` · auto-approves after ${fmtDate(close)}` : ' · no review close date set'),
          cta: { label: 'Open Pay periods', hash: '#/pay-periods' },
        }));
    }
    const finalized = periods.filter((p) => after(p.fields?.['Payroll_Finalized_At'], since));
    if (finalized.length) {
      items.push(item('payroll.finalized', 'info', `Payroll finalized for ${plural(finalized.length, 'week')}`,
        finalized.map((p) => ({ id: p.id, label: `${fmtDate(p.fields['Starting'])}–${fmtDate(p.fields['Ending'])}`, meta: null, hash: '#/pay-periods' }))));
    }
  }

  if (SUPER_ROLES.includes(role)) {
    const t = await scanAll(cfg, TICKETS_TABLE, {
      filterByFormula: `AND(NOT({Is_Reply}), {Message_Status} = 'Draft', IS_AFTER(CREATED_TIME(), '${since}'))`,
    }).catch(() => []);
    if (t.length) {
      items.push(item('tickets', 'info', `${plural(t.length, 'new tester ticket')}`,
        t.map((r) => ({
          id: r.id,
          label: short(r.fields?.['Message_Content'], 70) || '(ticket)',
          meta: (r.fields?.['Message_Summary'] || '').split(' posted ')[0] || null,
          url: TICKETS_PAGE,
        })), { cta: { label: 'Open Tickets', url: TICKETS_PAGE } }));
    }
  }

  // ============ Everyone: events and messages ============
  if (!isStaff) {
    const fresh = events.filter((e) => after(e.fields?.['Created'], since) && (!e.fields?.['Event_Date'] || e.fields['Event_Date'] >= today));
    if (fresh.length) {
      items.push(item('events.new', 'info', `${plural(fresh.length, 'new event')}`,
        fresh.map((e) => eventRow(e, [e.fields['Event_Date'] && fmtDate(e.fields['Event_Date']), e.fields['Attendance_Type'] || 'Required'].filter(Boolean).join(' · '))),
        { cta: { label: 'Open Events', hash: '#/events' } }));
    }
  }

  // Unread threads newer than both the inbox read marker and the card
  // cursor, so Got it quiets this too (opening Inbox clears it anyway).
  const floor = [ctx.lastChecked, since].filter(Boolean).sort().pop();
  // Staff can read every thread (audit), but their card counts only
  // threads they're in plus Staff Only ones; audit-worthy traffic has
  // its own lines (flagged, intern replies).
  const inThread = (r) => {
    const f = r.fields || {};
    return (f['Author'] || []).includes(auth.uid) || (f['Participants'] || []).includes(auth.uid) || f['Visibility'] === 'Staff Only';
  };
  const unread = roots
    .filter((r) => visibleRoot(r) && (!isStaff || inThread(r)))
    .map((r) => ({ r, latest: [r.fields?.['Created_Datetime'], r.fields?.['Latest_Reply_Datetime']].filter(Boolean).sort().pop() || null }))
    .filter(({ r, latest }) => {
      if (!latest || latest <= floor) return false;
      // A thread I started with no replies yet is just my own post.
      const mine = (r.fields?.['Author'] || []).includes(auth.uid);
      return !mine || (r.fields?.['Reply_Count'] || 0) > 0;
    })
    .sort((a, b) => String(b.latest).localeCompare(String(a.latest)));
  if (unread.length) {
    items.push(item('messages', 'info', `${plural(unread.length, 'conversation')} with new messages`,
      unread.slice(0, 3).map(({ r }) => threadRow(r, names(r.fields?.['Author']))),
      { cta: { label: 'Open Inbox', hash: '#/inbox' } }));
    items[items.length - 1].more = Math.max(0, unread.length - 3);
  }

  return items.sort((a, b) =>
    TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}

async function expectedHours(cfg, ids) {
  if (!ids.length) return {};
  const out = {};
  for (let i = 0; i < ids.length; i += 30) {
    const or = ids.slice(i, i + 30).map((id) => `RECORD_ID() = '${id}'`).join(', ');
    const data = await airtableGet(cfg, TABLES.USERS, { filterByFormula: `OR(${or})`, pageSize: '100', 'fields[]': 'Weekly_Expected_Hours' });
    for (const r of data.records || []) out[r.id] = Number(r.fields?.['Weekly_Expected_Hours']) || 0;
  }
  return out;
}

async function orgNames(cfg) {
  const data = await airtableGet(cfg, TABLES.PARTNER_ORGS, { pageSize: '100' });
  return Object.fromEntries((data.records || []).map((r) => [r.id, r.fields?.['Name'] || '(org)']));
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || '';
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }
  const cfg = env();
  if (!cfg) return json(500, origin, { error: 'server not configured' });
  const auth = requireAuth(cfg, event);
  if (!auth) return json(401, origin, { error: 'sign in again' });

  try {
    const meRec = await airtableGet(cfg, TABLES.USERS, { filterByFormula: `RECORD_ID() = '${auth.uid}'`, maxRecords: '1' });
    const me = meRec.records?.[0]?.fields || {};

    if (event.httpMethod === 'POST') {
      const b = JSON.parse(event.body || '{}');
      if (b.action !== 'seen') return json(400, origin, { error: 'unknown action' });
      const now = new Date().toISOString();
      // Never move the cursor past "now" (clock skew) or backwards.
      let asOf = typeof b.asOf === 'string' && !Number.isNaN(Date.parse(b.asOf)) ? new Date(b.asOf).toISOString() : now;
      if (asOf > now) asOf = now;
      const prev = me['Whats_New_Seen_At'];
      const fields = {};
      if (!prev || asOf > prev) fields.Whats_New_Seen_At = asOf;
      const add = (Array.isArray(b.dismiss) ? b.dismiss : []).map(String).filter((x) => /^[a-z.-]+:[A-Za-z0-9:]+$/.test(x)).slice(0, 20);
      if (add.length) {
        const cur = String(me['Whats_New_Dismissed'] || '').split(',').map((x) => x.trim()).filter(Boolean);
        fields.Whats_New_Dismissed = [...new Set([...cur.filter((x) => !add.includes(x)), ...add])].slice(-DISMISSED_KEEP).join(',');
      }
      if (Object.keys(fields).length) await airtableWrite(cfg, TABLES.USERS, 'PATCH', [{ id: auth.uid, fields }]);
      return json(200, origin, { ok: true, seenAt: fields.Whats_New_Seen_At || prev || null });
    }

    if (event.httpMethod !== 'GET') return json(405, origin, { error: 'method not allowed' });

    const nowIso = new Date().toISOString();
    const floor = new Date(Date.now() - MAX_LOOKBACK_DAYS * DAY).toISOString();
    const seen = me['Whats_New_Seen_At'];
    const since = seen ? (seen > floor ? seen : floor) : new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * DAY).toISOString();

    const users = await fetchUserMap(cfg);
    const dismissed = new Set(String(me['Whats_New_Dismissed'] || '').split(',').map((x) => x.trim()).filter(Boolean));
    const items = (await buildFeed(cfg, auth, me, users, since, nowIso)).filter((it) => !(it.reminder && dismissed.has(it.id)));
    return json(200, origin, { asOf: nowIso, since, items });
  } catch (err) {
    return json(502, origin, { error: err.message });
  }
}
