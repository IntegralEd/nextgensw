(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

  // "💬 Suggest edit" pill + feedback modal on every <section[id]>.
  // ACCESS CONTROL:
  //   Enabled ONLY when the page is loaded inside an iframe — i.e. via
  //   the gated Softr /website-review workspace. Direct visitors to
  //   nextgensw.org never see the pills or the modal.
  //   No query-param backdoor. Access is whatever Softr's user-group
  //   gating allows on the workspace page.
  // Click → opens the Softr feedback form in a modal with prefilled
  // Section + URL params. Falls back to a new tab if the modal isn't
  // available (defensive — the modal markup ships with index.html).
  const FEEDBACK_EMBED_URL =
    'https://NextGenSW.softr.app/embed/pages/1b098330-d473-415c-87ef-024c777add82/blocks/website-feedback';
  const FEEDBACK_PAGE_URL = 'https://NextGenSW.softr.app/website-feedback';

  function inIframe() {
    try { return window.self !== window.top; } catch (_e) { return true; }
  }
  function buildFeedbackUrl(base, section) {
    const url = location.origin + location.pathname + '#' + section;
    return `${base}?Section=${encodeURIComponent(section)}&URL=${encodeURIComponent(url)}`;
  }
  function openFeedbackModal(section) {
    const modal = document.getElementById('modal-feedback');
    if (!modal) return false;
    const iframe = modal.querySelector('iframe[data-src]');
    const tabLink = modal.querySelector('[data-feedback-open-tab]');
    if (!iframe) return false;
    iframe.setAttribute('data-src', buildFeedbackUrl(FEEDBACK_EMBED_URL, section));
    if (tabLink) tabLink.href = buildFeedbackUrl(FEEDBACK_PAGE_URL, section);
    // openModal (defined below) reads data-src and sets iframe.src.
    openModal('modal-feedback');
    return true;
  }

  if (inIframe()) {
    document.body.classList.add('is-admin');
    document.querySelectorAll('main section[id]').forEach(sec => {
      if (sec.querySelector('.suggest-edit')) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'suggest-edit';
      btn.dataset.section = sec.id;
      btn.setAttribute('aria-label', 'Suggest edit on this section');
      btn.innerHTML = '<span aria-hidden="true">💬</span><span class="se-label">Suggest edit</span>';
      sec.appendChild(btn);
    });
    document.addEventListener('click', e => {
      const b = e.target.closest('.suggest-edit');
      if (!b) return;
      e.preventDefault();
      const section = b.dataset.section || '';
      if (!openFeedbackModal(section)) {
        // Fallback: open the full Softr page in a new tab
        window.open(buildFeedbackUrl(FEEDBACK_PAGE_URL, section), '_blank', 'noopener');
      }
    });
  }

  const nav = document.querySelector('.site-nav');
  const toggle = document.querySelector('.nav-toggle');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        nav.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Modals: lazy-load iframes from data-src on open; ESC + backdrop close
  let lastFocus = null;
  function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    modal.querySelectorAll('iframe[data-src]').forEach(f => {
      if (!f.src) f.src = f.getAttribute('data-src');
    });
    const closer = modal.querySelector('.modal-close');
    if (closer) closer.focus();
  }
  function closeModal(modal) {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    modal.querySelectorAll('iframe[data-src]').forEach(f => {
      f.removeAttribute('src');
    });
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.getAttribute('data-modal-open')));
  });
  document.querySelectorAll('[data-modal-close]').forEach(el => {
    el.addEventListener('click', () => closeModal(el.closest('.modal')));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal:not([hidden])').forEach(closeModal);
  });

  // Scroll-triggered hub & spoke + counter
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stats = document.querySelectorAll('[data-stat-target]');
  if (stats.length && 'IntersectionObserver' in window) {
    const fmt = new Intl.NumberFormat('en-US');
    function animateCount(block) {
      block.classList.add('is-active');
      const target = parseInt(block.getAttribute('data-stat-target'), 10) || 0;
      const out = block.querySelector('[data-stat-value]');
      if (!out) return;
      if (reduced) { out.textContent = fmt.format(target); block.classList.add('is-counted'); return; }
      // Wait for the hub to settle before counting (matches CSS hub transition delay)
      const startDelay = block.classList.contains('hub-spoke') ? 600 : 0;
      const duration = 1400;
      setTimeout(() => {
        const t0 = performance.now();
        function tick(now) {
          const p = Math.min(1, (now - t0) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          out.textContent = fmt.format(Math.round(target * eased));
          if (p < 1) requestAnimationFrame(tick);
          else block.classList.add('is-counted');
        }
        requestAnimationFrame(tick);
      }, startDelay);
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.35 });
    stats.forEach(s => io.observe(s));
  }
})();
