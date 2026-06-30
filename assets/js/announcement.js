// assets/js/announcement.js
//
// Site-wide announcement surface — fetches a small JSON record and
// renders a dismissable top banner + first-visit modal per the spec
// at docs/ANNOUNCEMENT_BANNER_SPEC.md.
//
// Contract: assets/data/announcement.json (or an eventual /api endpoint
// against the Airtable Announcement table). See spec §2 for fields.
//
// Self-contained — no dependency on main.js. Hooks into <body> only.
(function () {
  'use strict';

  const DATA_URL = '/assets/data/announcement.json';
  const STORAGE_BANNER = 'ngsw_banner_dismissed';
  const STORAGE_MODAL = 'ngsw_modal_seen';
  const MODAL_DELAY_MS = 600;
  const reduced = window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ────────────────────────────────────────────────────────────
  // util
  // ────────────────────────────────────────────────────────────
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function safeNum(s) {
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  }
  function getLS(key) {
    try { return localStorage.getItem(key); } catch (_e) { return null; }
  }
  function setLS(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_e) { /* private mode */ }
  }

  // ────────────────────────────────────────────────────────────
  // countdown: whole days until end-of-day in NYC
  // ────────────────────────────────────────────────────────────
  // We use a fixed America/New_York EDT offset (-04:00) for the
  // active 2026 priority-deadline window. If announcements ever
  // span across the DST boundary we can switch to Intl-based
  // detection; for whole-day grain the worst-case error is one day
  // around the DST transition and that's acceptable per the spec
  // ("re-derive on load and once per minute").
  function daysUntilEOD(dateISO) {
    if (!dateISO) return 0;
    const dt = new Date(dateISO + 'T23:59:59.999-04:00');
    if (Number.isNaN(dt.getTime())) return 0;
    return Math.ceil((dt.getTime() - Date.now()) / 86400000);
  }
  function countdownText(days) {
    if (days <= 0) return 'Last day to apply';
    if (days === 1) return '1 day left';
    return days + ' days left';
  }

  // ────────────────────────────────────────────────────────────
  // banner
  // ────────────────────────────────────────────────────────────
  function renderBanner(data) {
    const days = daysUntilEOD(data.deadlineDate);
    const banner = document.createElement('div');
    banner.className = 'announcement-banner';
    if (reduced) banner.classList.add('announcement-reduced-motion');
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Site announcement');

    const showDays = !!data.showCountdown;
    banner.innerHTML =
      '<div class="announcement-banner-inner">' +
        '<span class="announcement-dot" aria-hidden="true"></span>' +
        '<span class="announcement-eyebrow">' + escapeHtml(data.eyebrow) + '</span>' +
        '<span class="announcement-headline">' + escapeHtml(data.headline) + '</span>' +
        (showDays
          ? '<span class="announcement-days" data-days-pill>' + escapeHtml(countdownText(days)) + '</span>'
          : '') +
        '<a href="' + escapeHtml(data.anchor) + '" class="announcement-cta">' +
          escapeHtml(data.buttonText) + ' →' +
        '</a>' +
        '<button type="button" class="announcement-dismiss" aria-label="Dismiss announcement">×</button>' +
      '</div>';

    document.body.insertBefore(banner, document.body.firstChild);

    banner.querySelector('.announcement-dismiss').addEventListener('click', function () {
      banner.remove();
      setLS(STORAGE_BANNER, safeNum(data.version));
    });

    return banner;
  }

  // ────────────────────────────────────────────────────────────
  // modal — uses the site's existing .modal shell so backdrop +
  // dialog styling is consistent. Specifics are in
  // .modal-dialog-announcement.
  // ────────────────────────────────────────────────────────────
  function renderModal(data) {
    const days = daysUntilEOD(data.deadlineDate);
    const modal = document.createElement('div');
    modal.className = 'modal modal-announcement';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'announcement-modal-headline');

    const daysPill = data.showCountdown
      ? '<span class="announcement-modal-days">' +
          '<strong>' + escapeHtml(String(Math.max(days, 0))) + '</strong> days left to apply' +
        '</span>'
      : '';

    modal.innerHTML =
      '<div class="modal-backdrop" data-ann-close></div>' +
      '<div class="modal-dialog modal-dialog-announcement">' +
        '<button type="button" class="modal-close" data-ann-close aria-label="Close">×</button>' +
        '<img class="announcement-modal-logo" src="/assets/img/logo.svg" alt="" aria-hidden="true">' +
        '<span class="announcement-modal-eyebrow">' + escapeHtml(data.eyebrow) + '</span>' +
        '<h2 id="announcement-modal-headline" class="announcement-modal-headline">' +
          escapeHtml(data.headline) +
        '</h2>' +
        daysPill +
        '<p class="announcement-modal-subtext">' + escapeHtml(data.subtext) + '</p>' +
        '<a href="' + escapeHtml(data.anchor) + '" class="announcement-modal-cta" data-ann-cta>' +
          escapeHtml(data.buttonText) +
        '</a>' +
        '<button type="button" class="announcement-modal-maybe" data-ann-close>Maybe later</button>' +
      '</div>';

    document.body.appendChild(modal);
    document.body.classList.add('modal-open');

    const lastFocus = document.activeElement;
    const closer = modal.querySelector('.modal-close');
    if (closer) closer.focus();

    function close() {
      setLS(STORAGE_MODAL, safeNum(data.version));
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', onEsc);
      modal.remove();
      if (lastFocus && typeof lastFocus.focus === 'function') {
        try { lastFocus.focus(); } catch (_e) { /* ignore */ }
      }
    }
    function onEsc(e) { if (e.key === 'Escape') close(); }

    modal.querySelectorAll('[data-ann-close]').forEach(el => {
      el.addEventListener('click', close);
    });
    // CTA click counts as "seen" but lets the link navigate.
    const cta = modal.querySelector('[data-ann-cta]');
    if (cta) cta.addEventListener('click', () => setLS(STORAGE_MODAL, safeNum(data.version)));

    document.addEventListener('keydown', onEsc);
    return modal;
  }

  // ────────────────────────────────────────────────────────────
  // init
  // ────────────────────────────────────────────────────────────
  function load() {
    return fetch(DATA_URL, { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null);
  }

  function withinWindow(data) {
    const now = Date.now();
    if (data.startsAt) {
      const t = new Date(data.startsAt).getTime();
      if (Number.isFinite(t) && t > now) return false;
    }
    if (data.endsAt) {
      const t = new Date(data.endsAt).getTime();
      if (Number.isFinite(t) && t < now) return false;
    }
    return true;
  }

  function tickPill(data) {
    // Re-derive once per minute so the day counter rolls over at
    // midnight (or whenever the visitor lingers across a day boundary).
    const pill = document.querySelector('.announcement-banner [data-days-pill]');
    if (!pill || !data.showCountdown) return;
    pill.textContent = countdownText(daysUntilEOD(data.deadlineDate));
  }

  async function init() {
    const data = await load();
    if (!data || !data.visible) return;
    if (!withinWindow(data)) return;

    const version = safeNum(data.version);

    if (data.showBanner) {
      const seen = safeNum(getLS(STORAGE_BANNER));
      if (seen < version) renderBanner(data);
    }
    if (data.showModal) {
      const seen = safeNum(getLS(STORAGE_MODAL));
      if (seen < version) {
        setTimeout(() => renderModal(data), MODAL_DELAY_MS);
      }
    }

    if (data.showCountdown) {
      setInterval(() => tickPill(data), 60 * 1000);
    }
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
