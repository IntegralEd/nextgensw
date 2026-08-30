// Identity handshake with the Softr parent page.
//
// The embed contract (Reference/softr-workspace-embed.html) puts the
// Softr-asserted email in the iframe URL:
//   /app/?email={LOGGED_IN_USER:email}#/PANEL_KEY
// We also accept it in the hash query (#/panel?email=...) and fall back
// to asking the parent via postMessage (WorkBase identity.js pattern).
//
// The asserted email is a HINT, not proof — /api/me verifies it against
// the Users table and everything after that rides the signed token.

const POSTMESSAGE_TIMEOUT_MS = 8000;

export function emailFromUrl() {
  const search = new URLSearchParams(window.location.search);
  if (search.get('email')) return search.get('email').trim();
  const hash = window.location.hash || '';
  const q = hash.indexOf('?');
  if (q !== -1) {
    const hashParams = new URLSearchParams(hash.slice(q + 1));
    if (hashParams.get('email')) return hashParams.get('email').trim();
  }
  return null;
}

export function requestEmailFromParent() {
  return new Promise((resolve) => {
    if (window.self === window.top) return resolve(null); // not embedded
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      resolve(null);
    }, POSTMESSAGE_TIMEOUT_MS);
    function onMessage(ev) {
      const email = ev?.data?.ngswEmail;
      if (typeof email === 'string' && email.includes('@')) {
        clearTimeout(timer);
        window.removeEventListener('message', onMessage);
        resolve(email.trim());
      }
    }
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ ngswIdentityRequest: true }, '*');
  });
}

export async function resolveAssertedEmail() {
  return emailFromUrl() || (await requestEmailFromParent());
}
