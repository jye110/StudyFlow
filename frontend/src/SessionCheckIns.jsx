import { formatDate, formatTime, formatMinutes } from "./components";
import { sessionEnded, sessionStatus, useCurrentTime } from "./session-status";

export function SessionCheckIns({ sessions, edit, navigate, disabled }) {
  const instant = useCurrentTime();
  const ended = sessions.filter((s) => sessionEnded(s, instant)).toReversed();
  const pending = ended.filter((s) => s.outcome === "pending");
  const reviewed = ended.filter((s) => s.outcome !== "pending");
  if (navigate) {
    return pending.length > 0 && (
      <section className="panel session-checkins">
        <h2>{pending.length} study sessions need confirmation</h2>
        <p>Did you complete the planned study? Confirm the outcome to keep your remaining work accurate.</p>
        <button className="button" onClick={() => navigate("schedule")}>Review study sessions</button>
      </section>
    );
  }
  if (!ended.length) return null;
  const row = (session) => (
    <li key={session.id} className="session-checkin-row">
      <div>
        <strong>{session.assignment_title}</strong>
        <p>{formatDate(session.starts_at)} · {formatTime(session.starts_at)} · {formatMinutes(session.minutes)}</p>
        <span className={`session-outcome ${session.outcome}`}>{sessionStatus(session, instant)}</span>
      </div>
      <button className="button" disabled={disabled} onClick={() => edit(session)}
        aria-label={`Review study session ${session.assignment_title} at ${formatDate(session.starts_at)} ${formatTime(session.starts_at)}`}>
        {session.outcome === "pending" ? "Confirm outcome" : "Change outcome"}
      </button>
    </li>
  );
  return (
    <section className="panel session-checkins" aria-labelledby="checkins-heading">
      <h2 id="checkins-heading">Study session check-in</h2>
      <p>{pending.length} awaiting confirmation · {formatMinutes(reviewed.filter((s) => s.outcome === "completed").reduce((sum, s) => sum + s.minutes, 0))} confirmed study time</p>
      <p className="field-hint">Pending sessions reserve their planned minutes until you confirm. Not completed returns the time to Schedule remaining. Finishing the assignment is always your decision.</p>
      <ul className="session-checkin-list">{pending.map(row)}</ul>
      {reviewed.length > 0 && (
        <details>
          <summary>Reviewed sessions ({reviewed.length})</summary>
          <ul className="session-checkin-list">{reviewed.map(row)}</ul>
        </details>
      )}
    </section>
  );
}
