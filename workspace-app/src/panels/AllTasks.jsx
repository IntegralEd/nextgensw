// Coordinator's program-wide task table. Multi-select filters
// (status, assignee, requester) plus an overdue toggle; CSV and XLSX
// exports honor whatever filters are active. XLSX loads on demand so
// the SheetJS bundle never weighs down intern phones.

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../api.js';

const STATUS_CHIP = {
  'Not Started': 'draft',
  'In Progress': 'submitted',
  'Blocked / Need Help': 'returned',
  'Ready for Review': 'ready',
  Complete: 'approved',
};
const STATUS_ORDER = ['Not Started', 'In Progress', 'Blocked / Need Help', 'Ready for Review', 'Complete'];

const todayISO = () => new Date().toISOString().slice(0, 10);
const isOverdue = (t) => t.dueDate && t.status !== 'Complete' && t.dueDate < todayISO();

function FilterGroup({ label, options, selected, onToggle }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label>{label}{selected.length ? ` (${selected.length})` : ''}</label>
      <div className="guide-list" style={{ marginBottom: 0 }}>
        {options.map((o) => (
          <button key={o} className={selected.includes(o) ? 'active' : ''} onClick={() => onToggle(o)}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function AllTasks() {
  const [tasks, setTasks] = useState(null);
  const [statusF, setStatusF] = useState([]);
  const [assigneeF, setAssigneeF] = useState([]);
  const [requesterF, setRequesterF] = useState([]);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState(null);

  const load = () =>
    apiFetch('tasks?scope=all').then((r) => setTasks(r.tasks)).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  const toggle = (arr, set) => (v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const options = useMemo(() => {
    if (!tasks) return { statuses: [], assignees: [], requesters: [] };
    const uniq = (vals) => [...new Set(vals.filter(Boolean))].sort();
    return {
      statuses: STATUS_ORDER.filter((s) => tasks.some((t) => t.status === s)),
      assignees: uniq(tasks.map((t) => t.assignedTo)),
      requesters: uniq(tasks.map((t) => t.assignedBy)),
    };
  }, [tasks]);

  const list = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(
      (t) =>
        (!statusF.length || statusF.includes(t.status)) &&
        (!assigneeF.length || assigneeF.includes(t.assignedTo)) &&
        (!requesterF.length || requesterF.includes(t.assignedBy)) &&
        (!overdueOnly || isOverdue(t))
    );
  }, [tasks, statusF, assigneeF, requesterF, overdueOnly]);

  const exportRows = () =>
    list.map((t) => ({
      Task: t.name,
      'Assigned to': t.assignedTo || '',
      'Requested by': t.assignedBy || '',
      Due: t.dueDate || '',
      Status: t.status,
      Review: t.reviewStatus || '',
      Priority: t.priority || '',
      'Est. chunk': t.estHours ?? '',
      'Est. hours (decimal)': t.estHoursDecimal ?? '',
      Overdue: isOverdue(t) ? 'yes' : '',
      'Submitted work': t.submittedWorkUrl || '',
    }));

  const stamp = () => todayISO().replace(/-/g, '');

  function exportCsv() {
    const rows = exportRows();
    if (!rows.length) return flash('Nothing to export with these filters', true);
    const cols = Object.keys(rows[0]);
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `tasks_${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash(`Exported ${rows.length} tasks (CSV)`);
  }

  async function exportXlsx() {
    const rows = exportRows();
    if (!rows.length) return flash('Nothing to export with these filters', true);
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `tasks_${stamp()}.xlsx`);
    flash(`Exported ${rows.length} tasks (XLSX)`);
  }

  async function archive(id) {
    setBusyId(id);
    try {
      await apiFetch('tasks', { method: 'PATCH', body: JSON.stringify({ id, action: 'archive' }) });
      await load();
      flash('Archived');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusyId(null);
    }
  }

  if (!tasks) return <div className="panel center muted">Loading all tasks…</div>;

  return (
    <div className="panel" style={{ maxWidth: 1000 }}>
      <h1>All tasks</h1>
      <p className="muted lead">
        {list.length} of {tasks.length} tasks shown
        {statusF.length || assigneeF.length || requesterF.length || overdueOnly ? ' (filtered)' : ''}.
      </p>

      <div className="card">
        <FilterGroup label="Status" options={options.statuses} selected={statusF} onToggle={toggle(statusF, setStatusF)} />
        <FilterGroup label="Assignee" options={options.assignees} selected={assigneeF} onToggle={toggle(assigneeF, setAssigneeF)} />
        <FilterGroup label="Requester" options={options.requesters} selected={requesterF} onToggle={toggle(requesterF, setRequesterF)} />
        <div className="guide-list" style={{ marginBottom: 0 }}>
          <button className={overdueOnly ? 'active' : ''} onClick={() => setOverdueOnly(!overdueOnly)}>
            Overdue only
          </button>
          {(statusF.length || assigneeF.length || requesterF.length || overdueOnly) ? (
            <button onClick={() => { setStatusF([]); setAssigneeF([]); setRequesterF([]); setOverdueOnly(false); }}>
              Clear filters
            </button>
          ) : null}
        </div>
        <div className="actions">
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-outline btn-sm" onClick={exportXlsx}>Export XLSX</button>
        </div>
      </div>

      {list.length === 0 && <p className="muted">Nothing matches these filters.</p>}

      {list.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>Task</th><th>Assignee</th><th>Requester</th><th>Due</th><th>Status</th><th>Review</th><th></th></tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id}>
                  <td>{t.name}</td>
                  <td>{t.assignedTo || '—'}</td>
                  <td>{t.assignedBy || '—'}</td>
                  <td style={isOverdue(t) ? { color: 'var(--brick)', fontWeight: 700 } : undefined}>
                    {t.dueDate || '—'}
                  </td>
                  <td><span className={`chip ${STATUS_CHIP[t.status] || 'draft'}`}>{t.status}</span></td>
                  <td>{t.reviewStatus || '—'}</td>
                  <td>
                    {t.status === 'Complete' && (
                      <button className="btn btn-ghost btn-sm" disabled={busyId === t.id} onClick={() => archive(t.id)}>
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
