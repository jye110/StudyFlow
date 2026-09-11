import { sessionEnded } from "./session-status.js";

export function assignmentStudyTotals(assignments, schedule, instant) {
  const totals = new Map(assignments.map((a) => [a.id, {
    completed: 0, unscheduled: 0, awaiting: 0,
  }]));
  for (const session of schedule.sessions) {
    const total = totals.get(session.assignment_id);
    if (!total) continue;
    if (session.outcome === "completed") total.completed += session.minutes;
    else if (session.outcome === "pending" && sessionEnded(session, instant))
      total.awaiting += session.minutes;
  }
  // Use the same remaining-work calculation shown by Schedule, including closed assignments.
  for (const work of schedule.unallocated) {
    const total = totals.get(work.assignment_id);
    if (total) total.unscheduled += work.minutes;
  }
  for (const assignment of assignments) {
    const total = totals.get(assignment.id);
    total.remaining = assignment.status === "Completed"
      ? 0
      : Math.max(0, assignment.estimated_minutes - total.completed);
  }
  return totals;
}
