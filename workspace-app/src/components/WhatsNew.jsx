// The "What's new" card (docs/WHATS_NEW_PROPOSAL.md), adapted from
// WorkBase's WhatsNew. Mounted by App above most panels; Home renders
// its own copy so it can say "You're all caught up".
//
// - Got it   → POST whats-new {action:'seen'}: the server stores the
//              cursor on the Users record (follows you across devices)
//              and silences the reminders that were showing.
// - Later    → hidden for this browser session, across pages, without
//              marking anything seen.
// - The feed is cached for 3 minutes per browser session so moving
//   between Softr pages doesn't refetch. sessionStorage only — it
//   clears when the browser session ends; every access is guarded.
// - Rendered inline (not position:fixed): auto-height sizes the iframe.

import { useEffect, useState } from 'react';
import { apiFetch, currentUser, getShowTest } from '../api.js';

const CACHE_MS = 3 * 60 * 1000;
const SHOW_ITEMS = 4;
const SHOW_CHECK = 8;

const store = {
  get(k) { try { return JSON.parse(window.sessionStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { window.sessionStorage.setItem(k, JSON.stringify(v)); } catch { /* blocked: per-load */ } },
  del(k) { try { window.sessionStorage.removeItem(k); } catch { /* ignore */ } },
};
const cacheKey = (uid) => `ngsw.whatsNew.feed:${uid}:${getShowTest() ? 'test' : 'real'}`;
const laterKey = (uid) => `ngsw.whatsNew.later:${uid}`;

// Panels that change data the feed reports call this so the card
// refetches instead of showing a stale cache.
export function invalidateWhatsNew() {
  const u = currentUser();
  if (u) store.del(cacheKey(u.id));
}

function go(entry) {
  if (entry.url) { window.open(entry.url, '_top'); return; }
  if (entry.hash) window.location.hash = entry.hash;
}

export default function WhatsNew({ emptyText = null, wide = false }) {
  const user = currentUser();
  const uid = user?.id;
  const [feed, setFeed] = useState(null); // { asOf, items }
  const [hidden, setHidden] = useState(() => Boolean(uid && store.get(laterKey(uid))));
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState({}); // item id -> expanded
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!uid || hidden) return;
    const cached = store.get(cacheKey(uid));
    if (cached && Date.now() - cached.at < CACHE_MS) { setFeed(cached.data); return; }
    apiFetch('whats-new')
      .then((data) => { store.set(cacheKey(uid), { at: Date.now(), data }); setFeed(data); })
      .catch(() => setFeed({ asOf: null, items: [] })); // the card is a nicety; never block a page
  }, [uid, hidden]);

  if (!uid || hidden || !feed) return null;
  const items = feed.items || [];
  if (!items.length) {
    return emptyText ? <p className="muted wn-empty">{emptyText}</p> : null;
  }

  async function gotIt() {
    setBusy(true);
    try {
      await apiFetch('whats-new', {
        method: 'POST',
        body: JSON.stringify({ action: 'seen', asOf: feed.asOf, dismiss: items.filter((i) => i.reminder).map((i) => i.id) }),
      });
      store.set(cacheKey(uid), { at: Date.now(), data: { asOf: feed.asOf, items: [] } });
      setFeed({ asOf: feed.asOf, items: [] });
    } catch { /* leave it up; they can try again */ } finally { setBusy(false); }
  }
  function later() {
    store.set(laterKey(uid), Date.now());
    setHidden(true);
  }
  function removeEntries(itemId, ids) {
    const next = items
      .map((i) => (i.id !== itemId ? i : { ...i, entries: i.entries.filter((e) => !ids.includes(e.id)) }))
      .filter((i) => i.entries.length || !i.checklist);
    const data = { ...feed, items: next };
    store.set(cacheKey(uid), { at: Date.now(), data });
    setFeed(data);
  }

  const shown = showAll ? items : items.slice(0, SHOW_ITEMS);
  return (
    <div className={`wn-wrap${wide ? ' wn-wide' : ''}`}>
    <section className="wn-card" aria-label="What's new">
      <div className="wn-head">
        <strong>What's new</strong>
        <div className="wn-head-actions">
          <button className="btn btn-ghost btn-sm" onClick={later} disabled={busy}>Later</button>
          <button className="btn btn-outline btn-sm" onClick={gotIt} disabled={busy}>Got it</button>
        </div>
      </div>
      <ul className="wn-items">
        {shown.map((it) => (
          <li key={it.id} className={`wn-item wn-${it.tone}`}>
            <button
              className="wn-title"
              aria-expanded={Boolean(open[it.id])}
              onClick={() => (it.entries.length ? setOpen({ ...open, [it.id]: !open[it.id] }) : it.cta && go(it.cta))}
            >
              <span>{it.title}</span>
              {it.entries.length > 0 && <span className="wn-caret" aria-hidden="true">{open[it.id] ? '−' : '+'}</span>}
            </button>
            {it.detail && <div className="wn-detail muted">{it.detail}</div>}
            {open[it.id] && (
              it.checklist === 'mark-reviewed'
                ? <ReviewChecklist item={it} onDone={(ids) => removeEntries(it.id, ids)} />
                : <EntryList item={it} />
            )}
          </li>
        ))}
      </ul>
      {items.length > SHOW_ITEMS && (
        <button className="wn-link" onClick={() => setShowAll(!showAll)}>
          {showAll ? 'Show fewer' : `Show ${items.length - SHOW_ITEMS} more`}
        </button>
      )}
    </section>
    </div>
  );
}

function EntryList({ item }) {
  return (
    <div className="wn-drill">
      <ul>
        {item.entries.map((e) => (
          <li key={e.id}>
            <button className="wn-link" onClick={() => go(e)}>{e.label}</button>
            {e.meta && <span className="muted"> · {e.meta}</span>}
          </li>
        ))}
      </ul>
      {item.more > 0 && <div className="muted wn-more">and {item.more} more</div>}
      {item.cta && <button className="btn btn-outline btn-sm" onClick={() => go(item.cta)}>{item.cta.label}</button>}
    </div>
  );
}

// Coordinator checklist: tick timesheets, Mark reviewed. Calls the
// existing review-hours bulk action (Coordinator_Review = Approved
// only — payroll is untouched). No select-all on purpose: tick what you
// actually looked at.
function ReviewChecklist({ item, onDone }) {
  const [sel, setSel] = useState([]);
  const [all, setAll] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const list = all ? item.entries : item.entries.slice(0, SHOW_CHECK);
  const toggle = (id) => setSel(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);

  async function markReviewed() {
    setBusy(true); setNotice(null);
    try {
      const ids = [...sel];
      await apiFetch('review-hours', { method: 'PATCH', body: JSON.stringify({ action: 'review', ids }) });
      setSel([]);
      setNotice({ ok: true, text: `Marked ${ids.length} ${ids.length === 1 ? 'timesheet' : 'timesheets'} reviewed ✓` });
      onDone(ids);
    } catch (e) {
      setNotice({ ok: false, text: `Couldn't mark reviewed: ${e.message}` });
    } finally { setBusy(false); setConfirming(false); }
  }

  return (
    <div className="wn-drill">
      <ul className="wn-check">
        {list.map((e) => (
          <li key={e.id}>
            <label>
              <input type="checkbox" checked={sel.includes(e.id)} onChange={() => toggle(e.id)} />
              <span>{e.label}</span>
              {e.meta && <span className="muted"> · {e.meta}</span>}
            </label>
          </li>
        ))}
      </ul>
      {item.entries.length > SHOW_CHECK && (
        <button className="wn-link" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${item.entries.length}`}</button>
      )}
      {item.more > 0 && <div className="muted wn-more">and {item.more} more on Review timesheets</div>}
      <div className="actions" style={{ marginTop: 8 }}>
        {!confirming ? (
          <button className="btn btn-secondary btn-sm" disabled={!sel.length || busy} onClick={() => setConfirming(true)}>
            Mark reviewed{sel.length ? ` (${sel.length})` : ''}
          </button>
        ) : (
          <>
            <button className="btn btn-secondary btn-sm" disabled={busy} onClick={markReviewed}>
              Yes, mark {sel.length} reviewed
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
        {item.cta && <button className="btn btn-outline btn-sm" onClick={() => go(item.cta)}>{item.cta.label}</button>}
      </div>
      {notice && <div className={notice.ok ? 'muted' : 'wn-error'} style={{ marginTop: 6 }}>{notice.text}</div>}
    </div>
  );
}
