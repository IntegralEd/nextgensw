import { useEffect, useState } from 'react';
import { resolveAssertedEmail } from './identity.js';
import { signIn } from './api.js';
import { PANELS, DEFAULT_PANEL, panelForRole } from './panels/index.jsx';

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
        setState({
          phase: err.status === 403 ? 'not-registered' : 'error',
          detail: err.message,
        });
      }
    })();
  }, []);

  if (state.phase === 'loading') {
    return <div className="panel center muted">Loading your workspace…</div>;
  }
  if (state.phase === 'no-identity') {
    return (
      <div className="panel center">
        <h1>No identity provided</h1>
        <p className="muted">
          This page must be opened from the NextGen SW workspace site while
          logged in. If you got here from the workspace, tell your program
          coordinator.
        </p>
      </div>
    );
  }
  if (state.phase === 'not-registered') {
    return (
      <div className="panel center">
        <h1>Account not found</h1>
        <p className="muted">
          Your login isn&apos;t registered in the workspace yet. Ask your
          program coordinator to add you.
        </p>
      </div>
    );
  }
  if (state.phase === 'error') {
    return (
      <div className="panel center">
        <h1>Something went wrong</h1>
        <p className="muted">{state.detail}</p>
      </div>
    );
  }

  const { panel, error } = panelForRole(panelKey, state.user.role);
  if (error === 'unknown-panel') {
    return (
      <div className="panel center">
        <h1>Page not found</h1>
        <p className="muted">
          No panel named “{panelKey}”. Available: {Object.keys(PANELS).join(', ')}
        </p>
      </div>
    );
  }
  if (error === 'not-allowed') {
    return (
      <div className="panel center">
        <h1>Not available</h1>
        <p className="muted">This page isn&apos;t part of your role&apos;s workspace.</p>
      </div>
    );
  }

  const Component = panel.component;
  return <Component />;
}
