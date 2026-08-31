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
import LogHours from './LogHours.jsx';
import MyHours from './MyHours.jsx';
import ReviewHours from './ReviewHours.jsx';
import PayPeriods from './PayPeriods.jsx';
import MyTasks from './MyTasks.jsx';
import AssignTask from './AssignTask.jsx';
import PartnerTasks from './PartnerTasks.jsx';
import AllTasks from './AllTasks.jsx';
import Inbox from './Inbox.jsx';
import Events from './Events.jsx';
import CohortAdmin from './CohortAdmin.jsx';

// Coordinator/Admin can log hours too (Rhonda logs her own hours per
// Ava's requirements); Employers don't log time.
const TIME_LOGGERS = ['Intern', 'Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'];
const STAFF = ['Coordinator', 'Admin', 'SuperAdmin', 'Super Admin'];

export const PANELS = {
  home: { component: Home, roles: ['*'], title: 'Home' },
  whoami: { component: WhoAmI, roles: ['*'], title: 'Who am I' },
  'user-guide': { component: UserGuide, roles: ['*'], title: 'User guide' },
  'log-hours': { component: LogHours, roles: TIME_LOGGERS, title: 'Log hours' },
  'my-hours': { component: MyHours, roles: TIME_LOGGERS, title: 'My hours' },
  'review-hours': { component: ReviewHours, roles: STAFF, title: 'Review hours' },
  'pay-periods': { component: PayPeriods, roles: STAFF, title: 'Pay periods' },
  'my-tasks': { component: MyTasks, roles: TIME_LOGGERS, title: 'My tasks' },
  // Task requests are open to every workspace role (2026-08-31):
  // teammates, intern → team, employer → intern all valid.
  'assign-task': { component: AssignTask, roles: ['*'], title: 'Request a task' },
  'partner-tasks': { component: PartnerTasks, roles: ['*'], title: 'Tasks you requested' },
  'all-tasks': { component: AllTasks, roles: STAFF, title: 'All tasks' },
  inbox: { component: Inbox, roles: ['*'], title: 'Inbox' },
  events: { component: Events, roles: ['*'], title: 'Events' },
  'cohort-admin': { component: CohortAdmin, roles: STAFF, title: 'Cohorts' },
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
