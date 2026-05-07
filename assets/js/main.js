(function () {
  document.getElementById('year').textContent = new Date().getFullYear();

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

  // Scroll-triggered counter on .stat-block
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stats = document.querySelectorAll('.stat-block[data-stat-target]');
  if (stats.length && 'IntersectionObserver' in window) {
    const fmt = new Intl.NumberFormat('en-US');
    function animateCount(block) {
      const target = parseInt(block.getAttribute('data-stat-target'), 10) || 0;
      const out = block.querySelector('[data-stat-value]');
      if (!out) return;
      if (reduced) { out.textContent = fmt.format(target); block.classList.add('is-counted'); return; }
      const duration = 1400;
      const t0 = performance.now();
      function tick(now) {
        const p = Math.min(1, (now - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        out.textContent = fmt.format(Math.round(target * eased));
        if (p < 1) requestAnimationFrame(tick);
        else block.classList.add('is-counted');
      }
      requestAnimationFrame(tick);
    }
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    stats.forEach(s => io.observe(s));
  }
})();
