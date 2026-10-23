import { useEffect, useState } from 'react';
import { resolveAssertedEmail } from './identity.js';
import { signIn, currentUser, onSessionChange } from './api.js';
import { PANELS, DEFAULT_PANEL, panelForRole } from './panels/index.jsx';
import WhatsNew from './components/WhatsNew.jsx';
import TestBar from './components/TestBar.jsx';
import SeatBar from './components/SeatBar.jsx';

// Panel key = the hash path: /app/#/whoami → "whoami".
// Query strings in the hash (#/panel?x=y) are stripped here and left
// for panels to read themselves.
function panelKeyFromHash() {
  const hash = (window.location.hash || '').replace(/^#\/?/, '');
  const key = hash.split('?')[0].trim();
  return key || DEFAULT_PANEL;
}

export default function App() {
  const [state, setState] = useState({ phase: 'loading' });
  const [panelKey, setPanelKey] = useState(panelKeyFromHash());
  // View as swaps the session (api.js); re-render when it does.
  const [, setSessionTick] = useState(0);
  useEffect(() => onSessionChange(() => setSessionTick((n) => n + 1)), []);

  useEffect(() => {
    const onHash = () => setPanelKey(panelKeyFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    (async () => {
      const email = await resolveAssertedEmail();
      if (!email) return setState({ phase: 'no-identity' });
      try {
        const user = await signIn(email);
        setState({ phase: 'ready', user });
      } catch (err) {
        // A 400 (invalid/placeholder email) means "not really signed
        // in" — e.g. the Softr editor preview, where the email param
        // isn't filled — so show the same friendly sign-in notice.
        const phase = err.status === 403 ? 'not-registered'
          : err.status === 400 ? 'no-identity'
          : 'error';
        setState({ phase, detail: err.message });
      }
    })();
  }, []);

  // The title of the page the user was trying to reach — known from
  // the hash even before/without a verified identity, so every notice
  // can name the page.
  const pageTitle = PANELS[panelKey]?.title || 'NextGen SW Workspace';

  const Notice = ({ title, children }) => (
    <div className="panel center">
      <h1>{title}</h1>
      <p className="muted">{children}</p>
    </div>
  );

  if (state.phase === 'loading') {
    return <div className="panel center muted">Loading {pageTitle}…</div>;
  }
  if (state.phase === 'no-identity') {
    return (
      <Notice title={pageTitle}>
        Access denied. Make sure you’re signed in to your NextGen SW account
        to view this page.
      </Notice>
    );
  }
  if (state.phase === 'not-registered') {
    return (
      <Notice title={pageTitle}>
        This account isn’t set up in the workspace yet. Ask your program
        coordinator to add you, then sign in again.
      </Notice>
    );
  }
  if (state.phase === 'error') {
    return (
      <Notice title={pageTitle}>
        Something went wrong loading this page. Try refreshing; if it keeps
        happening, let your program coordinator know. ({state.detail})
      </Notice>
    );
  }

  // During View as, the viewed person's role decides what opens.
  const user = currentUser() || state.user;
  const { panel, error } = panelForRole(panelKey, user.role);
  if (error === 'unknown-panel') {
    return <Notice title="Page not found">There’s no workspace page at this address.</Notice>;
  }
  if (error === 'not-allowed') {
    return (
      <>
      <SeatBar />
      <Notice title={pageTitle}>
        Access denied. This page isn’t part of your role’s workspace — if you
        think it should be, check that you’re signed in with the right NextGen
        SW account.
      </Notice>
      </>
    );
  }

  const Component = panel.component;
  return (
    <>
      <SeatBar />
      <TestBar />
      {/* keyed by identity so a View as switch never shows stale data */}
      {panel.whatsNew !== false && <WhatsNew key={`wn:${user.id}`} wide={panel.wide} />}
      <Component key={`${user.id}:${panelKey}`} />
    </>
  );
}
