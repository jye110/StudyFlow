import { useState } from "react";
import { Sparkles, ShieldCheck, Check } from "lucide-react";
import { api } from "./api";
import {
  Modal,
  Field,
  ErrorMessage,
  localInput,
  dateISO,
  formatMinutes,
  formatDate,
  formatTime,
} from "./components";
import { sessionEnded, sessionStatus, useCurrentTime } from "./session-status";
import { SessionAssignmentInfo } from "./SessionAssignmentInfo";

export function Editor({
  kind,
  record,
  courses,
  planSettings,
  sessionAssignment,
  schedule,
  onClose,
  onSaved,
}) {
  const isAssignment = kind === "assignment";
  const isSession = kind === "session";
  const instant = useCurrentTime();
  const started = isSession && new Date(record.starts_at).getTime() < instant;
  const ended = isSession && sessionEnded(record, instant);
  const assignmentInfo = isSession && (
    <SessionAssignmentInfo assignment={sessionAssignment} schedule={schedule}
      instant={instant} fallbackTitle={record.assignment_title} />
  );
  const defaults = isAssignment
    ? {
        course_id: record?.course_id || courses[0]?.id || "",
        title: "",
        notes: "",
        due_at: localInput(Date.now() + 86400000),
        start_mode: "now",
        start_at: "",
        estimated_minutes: 60,
        priority: "Medium",
        status: "Not Started",
      }
    : isSession
      ? { starts_at: "", minutes: 30 }
      : { name: "", code: "", color: "#2563eb" };
  const [values, setValues] = useState(() => {
    const result = { ...defaults };
    for (const key of Object.keys(defaults))
      if (record?.[key] !== undefined) result[key] = record[key];
    if (record?.due_at) result.due_at = localInput(record.due_at);
    if (isAssignment)
      result.start_at = record?.start_at
        ? localInput(record.start_at).slice(0, 10)
        : "";
    if (record?.starts_at) result.starts_at = localInput(record.starts_at);
    return result;
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const settings = planSettings || {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    start_hour: 9,
    end_hour: 22,
    daily_minutes: 180,
    horizon_days: 30,
  };
  const adjustmentMessage = (action, plan) =>
    !plan
      ? `Session ${action}.`
      : plan.remaining_minutes
        ? `Session ${action}. ${formatMinutes(plan.remaining_minutes)} could not fit in the later plan; review Schedule.`
        : `Session ${action}. Later study sessions adjusted automatically.`;
  async function removeSession() {
    setBusy(true);
    setError(null);
    try {
      const result = await api(`/sessions/${record.id}`, {
        method: "DELETE",
        body: { settings },
      });
      await onSaved(
        adjustmentMessage("deleted", result.replanned),
        result.replanned,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function field(name, label, props = {}) {
    return (
      <Field
        name={name}
        label={label}
        value={values[name]}
        error={error?.fields?.[name]}
        onChange={(e) => setValues({ ...values, [name]: e.target.value })}
        {...props}
      />
    );
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payload = { ...values };
    if (isSession) payload.settings = settings;
    for (const key of ["course_id", "estimated_minutes", "minutes"])
      if (key in payload) payload[key] = Number(payload[key]);
    for (const key of ["due_at", "starts_at"])
      if (key in payload) payload[key] = dateISO(payload[key]);
    if (isAssignment)
      payload.start_at =
        values.start_mode === "custom" && values.start_at
          ? dateISO(`${values.start_at}T00:00`)
          : null;
    try {
      const resource = isAssignment
        ? "assignments"
        : isSession
          ? "sessions"
          : "courses";
      const result = await api(
        `/${resource}${record?.id ? `/${record.id}` : ""}`,
        {
          method: record?.id ? "PATCH" : "POST",
          body: payload,
        },
      );
      await onSaved(
        isAssignment
          ? record && payload.estimated_minutes < record.estimated_minutes
            ? "Assignment saved. Excess future study time removed; started sessions preserved."
            : "Assignment saved. Choose Schedule remaining to arrange any unplanned work."
          : isSession
            ? adjustmentMessage("saved", result.replanned)
            : "Course saved.",
        result.replanned,
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (!busy) onClose();
  };
  async function confirmOutcome(outcome) {
    setBusy(true);
    setError(null);
    try {
      await api(`/sessions/${record.id}/outcome`, { method: "PATCH", body: { outcome } });
      await onSaved(outcome === "completed"
        ? "Session marked completed. Learning progress updated."
        : "Not completed recorded. Use Schedule remaining to arrange missing time for open assignments.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  if (started) return (
    <Modal title={ended ? "Review study session" : "Study session in progress"} onClose={close} wide>
      <div className="modal-body">
        <ErrorMessage error={error} />
        {assignmentInfo}
        <h3>Study session</h3>
        <p>{formatDate(record.starts_at)} · {formatTime(record.starts_at)} · {formatMinutes(record.minutes)}</p>
        <p>Outcome: <strong>{sessionStatus(record, instant)}</strong></p>
        <p>{ended
          ? "Did you complete this study session? Completed records your study minutes and changes a Not Started assignment to In Progress. Not completed makes these minutes available for rescheduling."
          : "You can confirm the outcome when this session ends. Its scheduled time is preserved."}</p>
        {ended && <p className="field-hint">You can correct this choice later. Changing Not completed to Completed removes any excess future study time. Assignments marked Completed stay completed unless you reopen them yourself.</p>}
      </div>
      <footer className="modal-footer session-outcome-actions">
        <button className="button" disabled={busy} onClick={close}>Close</button>
        {ended && <>
          <button className="button" disabled={busy || record.outcome === "missed"} onClick={() => confirmOutcome("missed")}>Not completed</button>
          <button className="button primary" disabled={busy || record.outcome === "completed"} onClick={() => confirmOutcome("completed")}>Completed</button>
        </>}
      </footer>
    </Modal>
  );
  if (confirmDelete)
    return (
      <Modal
        title="Delete study session?"
        onClose={() => {
          if (!busy) setConfirmDelete(false);
        }}
      >
        <div className="modal-body">
          <ErrorMessage error={error} />
          <p>
            Delete this session for <strong>{record.assignment_title}</strong>?
          </p>
          <p className="muted">
            This time will stay free. Its learning time will be added to the
            later plan, and later study sessions may move. Earlier sessions stay
            in place.
          </p>
        </div>
        <footer className="modal-footer">
          <button
            className="button"
            autoFocus
            disabled={busy}
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            className="button danger"
            disabled={busy}
            onClick={removeSession}
          >
            {busy ? "Deleting…" : "Delete session"}
          </button>
        </footer>
      </Modal>
    );
  return (
    <Modal
      title={`${record?.id ? "Edit" : "Add"} ${kind}`}
      onClose={close}
      wide={isAssignment || isSession}
    >
      <form onSubmit={submit} noValidate>
        <div className="modal-body">
          <ErrorMessage error={error} />
          {isAssignment ? (
            <>
              {field("title", "Assignment title", {
                autoFocus: true,
                maxLength: 200,
                placeholder: "e.g. Prepare the project demonstration",
              })}
              {field("course_id", "Course", {
                children: (
                  <>
                    <option value="">Choose a course</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `${c.code} · ` : ""}
                        {c.name}
                      </option>
                    ))}
                  </>
                ),
              })}
              <div className="form-grid">
                {field("due_at", "Due date and time", {
                  type: "datetime-local",
                  hint: "Shown in your local timezone.",
                })}
                {field("estimated_minutes", "Estimated time (minutes)", {
                  type: "number",
                  min: 1,
                  max: 10080,
                  hint: "Reducing this trims the latest future sessions. Use Schedule remaining to arrange extra time.",
                })}
              </div>
              <div className="form-grid">
                {field("priority", "Priority", {
                  children: ["High", "Medium", "Low"].map((p) => (
                    <option key={p}>{p}</option>
                  )),
                })}
                {field("status", "Status", {
                  children: ["Not Started", "In Progress", "Completed"].map(
                    (s) => <option key={s}>{s}</option>,
                  ),
                })}
              </div>
              {field("start_mode", "Earliest start", {
                children: (
                  <>
                    <option value="now">1 hour later</option>
                    <option value="week_before">
                      One week before deadline
                    </option>
                    <option value="custom">Custom date</option>
                  </>
                ),
                hint:
                  values.start_mode === "week_before"
                    ? "Starts 7 days before the deadline, or now if that time has passed. Follows deadline changes."
                    : values.start_mode === "now"
                      ? "New sessions start at least 1 hour after you generate or fill a plan. Existing sessions stay in place when filling."
                      : "No sessions will be scheduled before your chosen date.",
              })}
              {values.start_mode === "custom" &&
                field("start_at", "Start date", {
                  type: "date",
                  max:
                    new Date(values.due_at) < new Date()
                      ? undefined
                      : values.due_at.slice(0, 10),
                  hint: "Starts at local midnight. For work not yet overdue, choose a date on or before the deadline. Overdue work can start on a later date.",
                })}
              <p className="field-hint">
                Changing the earliest start removes future sessions before it.
                Regenerate your plan to reschedule that time. If work cannot
                fit, it stays unscheduled; we won't start it earlier.
              </p>
              {field("notes", "Notes (optional)", {
                multiline: true,
                maxLength: 4000,
                placeholder: "Describe the assignment topic, required work and what you need to submit.",
                hint: "Required for AI suggestions. Include enough detail to explain the assignment.",
              })}
            </>
          ) : isSession ? (
            <>
              {assignmentInfo}
              <h3>Study session</h3>
              {field("starts_at", "Planned date and time", {
                type: "datetime-local",
              })}
              {field("minutes", "Duration (minutes)", {
                type: "number",
                min: 1,
                max: 240,
              })}
              <p className="field-hint">
                Saving automatically adjusts later study sessions to match the
                remaining assignment estimates. Earlier sessions stay in place.
                Deleted or shortened time stays free; missing study time is
                added later. Your last plan settings, busy times, earliest
                starts and applicable deadlines are respected.
              </p>
            </>
          ) : (
            <>
              {field("name", "Course name", {
                autoFocus: true,
                maxLength: 120,
                placeholder: "e.g. Software Engineering",
              })}
              {field("code", "Course code (optional)", {
                maxLength: 30,
                placeholder: "e.g. CS 2101",
              })}
              {field("color", "Course color", { type: "color" })}
            </>
          )}
        </div>
        <footer className="modal-footer">
          {isSession && record?.id && (
            <button
              type="button"
              className="button danger session-delete"
              disabled={busy || new Date(record.starts_at) < new Date()}
              onClick={() => {
                setError(null);
                setConfirmDelete(true);
              }}
            >
              Delete session
            </button>
          )}
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : `Save ${kind}`}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function ConfirmDelete({ item, onClose, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  async function remove() {
    setBusy(true);
    try {
      await api(
        `/${item.kind === "course" ? "courses" : "assignments"}/${item.record.id}`,
        { method: "DELETE" },
      );
      await onSaved("Deleted successfully.");
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Delete ${item.kind}?`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <ErrorMessage error={error} />
        <p>
          <strong>{item.record.title || item.record.name}</strong>
        </p>
        <p className="muted">
          {item.kind === "course"
            ? "This will also delete every assignment and study session in this course."
            : "This will also delete its study sessions and accepted task breakdown."}{" "}
          This cannot be undone.
        </p>
      </div>
      <footer className="modal-footer">
        <button className="button" autoFocus onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="button danger" onClick={remove} disabled={busy}>
          {busy ? "Deleting…" : `Delete ${item.kind}`}
        </button>
      </footer>
    </Modal>
  );
}

export function AIPanel({ assignment, onClose, onSaved, onEdit }) {
  const [steps, setSteps] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const hasNotes = Boolean(assignment.notes?.trim());
  async function request() {
    if (!hasNotes) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api(`/assignments/${assignment.id}/ai-suggestion`, {
        method: "POST",
        body: {},
      });
      setSteps(data.steps);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function accept() {
    setBusy(true);
    setError(null);
    try {
      await api(`/assignments/${assignment.id}/breakdown`, {
        method: "PUT",
        body: { steps },
      });
      await onSaved("Task breakdown accepted and saved.");
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Break it into smaller steps"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <div className="modal-body">
        <div className="ai-label">
          <Sparkles size={16} /> Optional AI assistance
        </div>
        <h3>{assignment.title}</h3>
        <ErrorMessage error={error} />
        {!hasNotes && (
          <p role="status" className="privacy-note">
            Add the assignment requirements to Notes before requesting AI suggestions.
          </p>
        )}
        {steps ? (
          <>
            <p className="muted">
              AI-generated suggestion · Review these steps before accepting.
              They have not been saved.
            </p>
            <ol className="step-list">
              {steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </>
        ) : (
          <>
            {assignment.breakdown && (
              <>
                <p className="eyebrow">Accepted breakdown</p>
                <ol className="step-list">
                  {assignment.breakdown.map((step, i) => (
                    <li key={i}>{step}</li>
                  ))}
                </ol>
              </>
            )}
            <p className="muted">
              AI checks whether your Notes explain the assignment. If more detail
              is needed, it will ask you to add requirements before generating steps.
            </p>
            <div className="privacy-note">
              <ShieldCheck size={19} />
              <span>
                Your assignment title, Notes, estimated time, and priority are sent
                to the AI provider when you request a suggestion. Include only
                assignment information you want to share.
              </span>
            </div>
          </>
        )}
      </div>
      <footer className="modal-footer">
        {!steps && (!hasNotes || error?.fields?.notes) && (
          <button className="button" onClick={onEdit} disabled={busy}>Edit notes</button>
        )}
        <button className="button" onClick={onClose} disabled={busy}>
          {steps ? "Dismiss" : "Close"}
        </button>
        {steps ? (
          <button className="button primary" onClick={accept} disabled={busy}>
            <Check size={16} />
            {busy ? "Saving…" : "Accept breakdown"}
          </button>
        ) : (
          <button className="button primary" onClick={request} disabled={busy || !hasNotes}>
            <Sparkles size={16} />
            {busy ? "Requesting…" : "Request AI suggestion"}
          </button>
        )}
      </footer>
    </Modal>
  );
}
