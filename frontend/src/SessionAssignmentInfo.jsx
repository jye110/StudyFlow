import { assignmentStudyTotals } from "./assignment-study-totals";
import { formatDate, formatTime, formatMinutes } from "./components";

export function SessionAssignmentInfo({ assignment, schedule, instant, fallbackTitle }) {
  if (!assignment) return <p className="muted">{fallbackTitle}</p>;
  const totals = assignmentStudyTotals([assignment], schedule, instant).get(assignment.id);
  const overdue = assignment.status !== "Completed" && new Date(assignment.due_at).getTime() < instant;
  const fields = [
    ["Course", `${assignment.course.name}${assignment.course.code ? ` (${assignment.course.code})` : ""}`],
    ["Due", `${formatDate(assignment.due_at)} · ${formatTime(assignment.due_at)}${overdue ? " · Overdue" : ""}`],
    ["Priority", assignment.priority],
    ["Assignment status", assignment.status],
    ["Estimated study", formatMinutes(assignment.estimated_minutes)],
    ["Remaining study", formatMinutes(totals.remaining)],
    ["Not scheduled", formatMinutes(totals.unscheduled)],
    ["Awaiting confirmation", formatMinutes(totals.awaiting)],
  ];
  return (
    <section className="session-assignment-info" aria-label="Assignment information">
      <p className="eyebrow">Assignment</p>
      <h3>{assignment.title}</h3>
      <dl className="session-assignment-facts">
        {fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <div className="session-assignment-notes">
        <h4>Notes</h4>
        <div className="session-assignment-text" tabIndex={0} role="region" aria-label="Assignment notes">
          {assignment.notes?.trim() ? assignment.notes : "No notes added."}
        </div>
      </div>
      {assignment.breakdown?.length > 0 && (
        <details className="session-assignment-breakdown">
          <summary>Accepted task breakdown</summary>
          <ol className="step-list">{assignment.breakdown.map((step, i) => <li key={i}>{step}</li>)}</ol>
        </details>
      )}
    </section>
  );
}
