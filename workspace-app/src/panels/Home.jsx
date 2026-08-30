import { currentUser } from '../api.js';

export default function Home() {
  const user = currentUser();
  const firstName = (user?.fullName || '').split(' ')[0] || 'there';
  return (
    <div className="panel">
      <h1>Welcome, {firstName}</h1>
      <p className="muted">
        This is the NextGen SW workspace. Panels for logging hours, tasks,
        and messages arrive here stage by stage — this shell is Stage 0.
      </p>
    </div>
  );
}
