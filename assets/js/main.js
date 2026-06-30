(function () {
  // When the live intern application is published, paste its URL here.
  // Set to null while the form is unpublished — the Apply CTAs then
  // open the "notify me when applications open" modal instead.
  // Use the direct Google Form viewform URL (not the bit.ly), since
  // bit.ly wraps with an interstitial ad.
  //
  // NOTE: anonymous curl on this URL returns 401 → ServiceLogin.
  // That's not a misconfiguration — Google Forms requires a signed-in
  // Google account whenever ANY question is a file upload, and the
  // application has a resume upload. Real browser visits with a
  // signed-in user resolve normally. The sign-in barrier is the
  // price of accepting resume attachments through Forms; if drop-off
  // ever shows it's the gate, the alternative is moving resume
  // collection to a separate tool (Typeform, Tally, Jotform) or
  // asking for a drive-share link instead of a direct upload.
  const APPLY_URL = 'https://docs.google.com/forms/d/e/1FAIpQLScjURkZPeIH-EqGDPLH7Q-qcSS33O0dptqfK00TIbyJ06b-UA/viewform';

  document.getElementById('year').textContent = new Date().getFullYear();

  // Apply CTA router — single source of truth for what "Apply" does.
  // Intercepts clicks before the generic data-modal-open handler so
  // the same buttons work whether APPLY_URL is set or null.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-modal-open="modal-apply-notify"]');
    if (!btn) return;
    if (APPLY_URL) {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.open(APPLY_URL, '_blank', 'noopener');
    }
    // else: fall through to the generic modal handler below
  }, true);

  // When APPLY_URL is set, drop the "Notify me" pill + coming-soon
  // styling on the Apply buttons so they look like normal CTAs.
  if (APPLY_URL) {
    document.querySelectorAll('[data-modal-open="modal-apply-notify"]').forEach(btn => {
      btn.querySelectorAll('.btn-soon').forEach(s => s.remove());
      btn.classList.remove('btn-coming-soon');
    });
  }

  // "💬 Suggest edit" pill on every <section[id]>.
  // ACCESS CONTROL:
  //   Enabled ONLY when the page is loaded inside an iframe — i.e. via
  //   the gated Softr /website-review workspace. Direct visitors to
  //   nextgensw.org never see the pills.
  //   No query-param backdoor. Access is whatever Softr's user-group
  //   gating allows on the workspace page.
  // Click → opens the Softr feedback form in a NEW TAB with prefilled
  // Section + URL params. We tried an in-page iframe modal but Softr's
  // session cookies are third-party there and most browsers block them,
  // forcing a sign-in loop. New-tab keeps the existing Softr session.
  const FEEDBACK_PAGE_URL = 'https://NextGenSW.softr.app/website-feedback';

  function inIframe() {
    try { return window.self !== window.top; } catch (_e) { return true; }
  }
  function buildFeedbackUrl(section) {
    const url = location.origin + location.pathname + '#' + section;
    return `${FEEDBACK_PAGE_URL}?Section=${encodeURIComponent(section)}&URL=${encodeURIComponent(url)}`;
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
      window.open(buildFeedbackUrl(section), '_blank', 'noopener');
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

  // "Notify me when applications open" form (Apply CTA → Contact_List)
  const applyForm = document.getElementById('apply-notify-form');
  if (applyForm) {
    const status = applyForm.querySelector('[data-status]');
    const submit = applyForm.querySelector('.ng-submit');
    function setStatus(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.dataset.kind = kind || '';
      status.hidden = !msg;
    }
    applyForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Honeypot trip
      if (applyForm.querySelector('.ng-honeypot').value) return;
      const data = new FormData(applyForm);
      const email = String(data.get('email') || '').trim();
      const name = String(data.get('name') || '').trim();
      if (!name || !/.+@.+\..+/.test(email)) {
        setStatus('Please enter a name and a valid email.', 'err');
        return;
      }
      submit.disabled = true;
      setStatus('Sending…', '');
      try {
        const res = await fetch('/.netlify/functions/interest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            notes: String(data.get('notes') || ''),
            interests: ['Intern/Applicant'],
            referral_source: 'Apply CTA — application waitlist',
            consent: true,
          }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        applyForm.classList.add('is-submitted');
        applyForm.innerHTML =
          '<div class="ng-success">' +
          '<h4>You\'re on the list. ✨</h4>' +
          '<p>We\'ll email you the moment the 2026 cohort application opens.</p>' +
          '</div>';
      } catch (err) {
        submit.disabled = false;
        setStatus('Something went wrong. Try again, or email hello@nextgensw.org.', 'err');
      }
    });
  }

  // "Contact us" form (footer / Learn More → Contact_List)
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    const cstatus = contactForm.querySelector('[data-status]');
    const csubmit = contactForm.querySelector('.ng-submit');
    function setContactStatus(msg, kind) {
      if (!cstatus) return;
      cstatus.textContent = msg;
      cstatus.dataset.kind = kind || '';
      cstatus.hidden = !msg;
    }
    contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      // Honeypot — silent drop, no error to the user (bots get no signal)
      if (contactForm.querySelector('.ng-honeypot').value) return;
      const data = new FormData(contactForm);
      const email = String(data.get('email') || '').trim();
      const name = String(data.get('name') || '').trim();
      const message = String(data.get('message') || '').trim();
      if (!name || !/.+@.+\..+/.test(email) || !message) {
        setContactStatus('Please complete name, email, and message.', 'err');
        return;
      }
      csubmit.disabled = true;
      setContactStatus('Sending…', '');
      try {
        const res = await fetch('/.netlify/functions/contact', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, message }),
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        contactForm.classList.add('is-submitted');
        contactForm.innerHTML =
          '<div class="ng-success">' +
          '<h4>Message sent. ✨</h4>' +
          '<p>Thanks for reaching out — we\'ll get back to you soon.</p>' +
          '</div>';
      } catch (err) {
        csubmit.disabled = false;
        setContactStatus('Something went wrong. Please try again in a moment.', 'err');
      }
    });
  }

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
