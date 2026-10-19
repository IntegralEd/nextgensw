// The View as strip: dark, not dismissible, on every page of a session.
// Names whose view it is and who is looking (AgentAdmin's SeatStrip).

import { currentSeat, currentUser, endSeat } from '../api.js';

export default function SeatBar() {
  const seat = currentSeat();
  if (!seat) return null;
  const u = currentUser();
  return (
    <div className="seat-bar" role="status">
      <span>
        <strong>Viewing as {u?.fullName || u?.email}</strong> · {u?.role}{u?.isTest ? ' (test account)' : ''} · read-only.
        {' '}You're {seat.viewer?.name}.
      </span>
      <button className="btn btn-sm seat-exit" onClick={() => { endSeat(); window.location.hash = '#/view-as'; }}>Exit View as</button>
    </div>
  );
}
