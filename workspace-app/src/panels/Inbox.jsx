// The unified inbox: every thread the caller may see (the API filters
// by visibility), newest activity first, unread dots vs the last time
// they opened this panel. Compose starts a DM/group thread; anything
// item-anchored is started from the item's own panel.

import { useEffect, useState } from 'react';
import { apiFetch, currentUser } from '../api.js';

function Dot() {
  return <span style={{
    display: 'inline-block', width: 9, height: 9, borderRadius: 9,
    background: 'var(--brick)', marginRight: 8, flexShrink: 0,
  }} />;
}

export default function Inbox() {
  const [data, setData] = useState(null); // { threads, people }
  const [openThread, setOpenThread] = useState(null); // { root, replies }
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const me = currentUser();

  const load = () =>
    apiFetch('messages?mark=1').then(setData).catch((e) => flash(e.message, true));
  useEffect(() => { load(); }, []);

  function flash(text, error = false) {
    setToast({ text, error });
    setTimeout(() => setToast(null), 4000);
  }

  async function openOne(id) {
    try {
      setOpenThread(await apiFetch(`messages?thread=${id}`));
      setReply('');
    } catch (e) {
      flash(e.message, true);
    }
  }

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      await apiFetch('messages', {
        method: 'POST',
        body: JSON.stringify({ action: 'reply', threadId: openThread.root.id, content: reply }),
      });
      await openOne(openThread.root.id);
      setReply('');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  async function sendNew() {
    if (!to.length) return flash('Pick at least one person', true);
    if (!body.trim()) return flash('Write a message', true);
    setBusy(true);
    try {
      await apiFetch('messages', {
        method: 'POST',
        body: JSON.stringify({ action: 'thread', participants: to, subject, content: body }),
      });
      setComposing(false); setTo([]); setSubject(''); setBody('');
      await load();
      flash('Sent ✓');
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="panel center muted">Loading your inbox…</div>;

  // ---- open thread view ----
  if (openThread) {
    const { root, replies } = openThread;
    return (
      <div className="panel">
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => { setOpenThread(null); load(); }}>
          ← Back to inbox
        </button>
        <h1>{root.subject || '(no subject)'}</h1>
        {[root, ...replies].map((m) => (
          <div className="card" key={m.id} style={m.authorIds?.includes(me?.id) ? { background: 'var(--gray-50)' } : undefined}>
            <div className="muted" style={{ fontSize: '0.85rem', marginBottom: 6 }}>
              <strong style={{ color: 'var(--ink)' }}>{m.author}</strong>
              {m.createdAt ? ` · ${new Date(m.createdAt).toLocaleString()}` : ''}
            </div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
        <label>Reply</label>
        <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
        <div className="actions">
          <button className="btn btn-primary" disabled={busy || !reply.trim()} onClick={sendReply}>Send reply</button>
        </div>
        {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
      </div>
    );
  }

  // ---- compose view ----
  if (composing) {
    return (
      <div className="panel">
        <button className="btn btn-ghost btn-sm" style={{ paddingLeft: 0 }} onClick={() => setComposing(false)}>
          ← Cancel
        </button>
        <h1>New message</h1>
        <label>To</label>
        <div className="guide-list">
          {data.people.map((p) => (
            <button key={p.id} className={to.includes(p.id) ? 'active' : ''}
              onClick={() => setTo(to.includes(p.id) ? to.filter((x) => x !== p.id) : [...to, p.id])}>
              {p.name} ({p.role})
            </button>
          ))}
        </div>
        <label>Subject (optional)</label>
        <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <label style={{ marginTop: 8 }}>Message</label>
        <textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="muted" style={{ fontSize: '0.85rem' }}>
          Visible to the people you pick — and to program staff.
        </p>
        <div className="actions">
          <button className="btn btn-primary" disabled={busy} onClick={sendNew}>Send</button>
        </div>
        {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
      </div>
    );
  }

  // ---- inbox list ----
  const unreadCount = data.threads.filter((t) => t.unread).length;
  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <h1>Inbox</h1>
        <button className="btn btn-primary btn-sm" onClick={() => setComposing(true)}>New message</button>
      </div>
      <p className="muted lead">
        {data.threads.length === 0
          ? 'No conversations yet.'
          : unreadCount
            ? `${unreadCount} with new activity since your last visit.`
            : 'You’re all caught up.'}
      </p>

      {data.threads.map((t) => (
        <div className="card" key={t.id} style={{ cursor: 'pointer' }} onClick={() => openOne(t.id)}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            {t.unread && <Dot />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{t.subject || t.anchorLabel || '(no subject)'}</strong>
              {t.subject && t.anchorLabel && (
                <span className="muted" style={{ fontSize: '0.85rem' }}> · {t.anchorLabel}</span>
              )}
              <div className="muted" style={{ fontSize: '0.9rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.author}: {String(t.content).replace(/\n+/g, ' ').slice(0, 90)}
              </div>
            </div>
            <span className="muted" style={{ fontSize: '0.8rem', marginLeft: 10, whiteSpace: 'nowrap' }}>
              {t.replyCount ? `${t.replyCount} ${t.replyCount === 1 ? 'reply' : 'replies'} · ` : ''}
              {t.latestAt ? new Date(t.latestAt).toLocaleDateString() : ''}
            </span>
          </div>
        </div>
      ))}

      {toast && <div className={`toast${toast.error ? ' error' : ''}`}>{toast.text}</div>}
    </div>
  );
}
