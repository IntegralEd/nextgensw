// A strip at the top of every page when test data is in play:
//  - signed in as a test account → nothing done here reaches the real
//    program (it's hidden from real users, reports and payroll)
//  - staff with "Show test data" on → test rows are mixed in; one click
//    hides them again
// See netlify/functions/_lib/testdata.mjs.

import { currentUser, getShowTest, setShowTest } from '../api.js';

export default function TestBar() {
  const user = currentUser();
  if (!user) return null;
  if (user.isTest) {
    return (
      <div className="test-bar" role="note">
        <strong>Test account.</strong> Everything you do here stays in the test sandbox. Real interns,
        partners, reports and payroll never see it.
      </div>
    );
  }
  if (getShowTest()) {
    return (
      <div className="test-bar" role="note">
        <strong>Showing test data</strong> alongside the real program. Payroll exports still leave it out.{' '}
        <button className="wn-link" onClick={() => { setShowTest(false); window.location.reload(); }}>Hide test data</button>
      </div>
    );
  }
  return null;
}
