// Weekly intern report (coordinator/admin): pick a week, see one row per
// intern — hours, tasks, required-event attendance — then export CSV/
// XLSX or print a clean page to share with program supervisors.

import { useEffect, useState } from 'react';
import { apiFetch } from '../api.js';

const COLS = [
  ['name', 'Intern'],
  ['hoursSubmitted', 'Hours submitted'],
  ['hoursApproved', 'Hours approved'],
  ['tasksCompleted', 'Tasks completed'],
  ['tasksOpen', 'Tasks open'],
  ['tasksOverdue', 'Overdue'],
  ['requiredAttended', 'Required events attended'],
  ['requiredMissed', 'Required events missed'],
];

export default function Reports() {
  const [periods, setPeriods] = useState(null);
  const [periodId, setPeriodId] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiFetch('pay-periods').then((r) => {
      setPeriods(r.periods);
      const cur = r.periods.find((p) => p.isCurrent) || r.periods[r.periods.length - 1];
      if (cur) setPeriodId(cur.id);
    }).catch((e) => flash(e.message, true));
  }, []);

  useEffect(() => {
    if (!periodId) return;
    setBusy(true);
    apiFetch(`reports?period=${periodId}`).then(setReport).catch((e) => flash(e.message, true))
      .finally(() => setBusy(false));
  }, [periodId]);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
  const stamp = () => (report?.period.label || 'week').replace(/[^0-9a-z]+/gi, '-');

  function exportCsv() {
    if (!report?.rows.length) return flash('Nothing to export', true);
    const lines = [
      ['Week', report.period.label].map(cell).join(','),
      '',
      COLS.map(([, h]) => h).join(','),
      ...report.rows.map((r) => COLS.map(([k]) => cell(r[k])).join(',')),
    ];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    a.download = `intern-report_${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash('Exported CSV');
  }

  async function exportXlsx() {
    if (!report?.rows.length) return flash('Nothing to export', true);
    const XLSX = await import('xlsx');
    const rows = report.rows.map((r) => Object.fromEntries(COLS.map(([k, h]) => [h, r[k]])));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Intern report');
    XLSX.writeFile(wb, `intern-report_${stamp()}.xlsx`);
    flash('Exported XLSX');
  }

  if (!periods) return <div className="panel center muted">Loading…</div>;

  const totals = report ? COLS.slice(1).map(([k]) => report.rows.reduce((a, r) => a + (r[k] || 0), 0)) : [];

  return (
    <div className="panel" style={{ maxWidth: 1000 }}>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>Weekly intern report</h1>
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}>Export CSV</button>
          <button className="btn btn-outline btn-sm" onClick={exportXlsx}>Export XLSX</button>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Print / PDF</button>
        </div>
      </div>
      <h1 className="print-only">Weekly intern report</h1>

      <div className="no-print" style={{ maxWidth: 320, marginTop: 8 }}>
        <label>Week</label>
        <select value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
          {periods.map((p) => <option key={p.id} value={p.id}>{p.label}{p.isCurrent ? ' (current)' : ''}</option>)}
        </select>
      </div>

      {report && (
        <>
          <p className="muted lead">
            Week of {report.period.label} ({report.period.starting} to {report.period.ending}) ·
            {' '}{report.rows.length} intern{report.rows.length === 1 ? '' : 's'}
            {busy ? ' · refreshing…' : ''}
          </p>
          <div className="table-wrap">
            <table className="data">
              <thead><tr>{COLS.map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.internId}>
                    {COLS.map(([k]) => (
                      <td key={k} style={k === 'tasksOverdue' && r[k] > 0 ? { color: 'var(--brick)', fontWeight: 700 }
                        : k === 'requiredMissed' && r[k] > 0 ? { color: 'var(--brick)', fontWeight: 700 } : undefined}>
                        {r[k]}
                      </td>
                    ))}
                  </tr>
                ))}
                {report.rows.length > 1 && (
                  <tr style={{ fontWeight: 700 }}>
                    <td>Total</td>
                    {totals.map((t, i) => <td key={i}>{Math.round(t * 100) / 100}</td>)}
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {report.rows.length === 0 && <p className="muted">No interns on the roster yet.</p>}
        </>
      )}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
