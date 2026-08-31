// The panel registry — the heart of the "deploy panels, never touch
// Softr" contract. A Softr page embeds /app/#/PANEL_KEY once; from
// then on, adding or changing screens is an entry here plus a deploy.
//
// roles: which User_Role values may open the panel. '*' = any
// signed-in user. The API enforces data access regardless — this
// gate just keeps people out of screens that would 403 anyway.

import Home from './Home.jsx';
import WhoAmI from './WhoAmI.jsx';
import UserGuide from './UserGuide.jsx';

export const PANELS = {
  home: { component: Home, roles: ['*'], title: 'Home' },
  whoami: { component: WhoAmI, roles: ['*'], title: 'Who am I' },
  'user-guide': { component: UserGuide, roles: ['*'], title: 'User guide' },
};

export const DEFAULT_PANEL = 'home';

export function panelForRole(key, role) {
  const panel = PANELS[key];
  if (!panel) return { error: 'unknown-panel' };
  if (!panel.roles.includes('*') && !panel.roles.includes(role)) {
    return { error: 'not-allowed' };
  }
  return { panel };
}
