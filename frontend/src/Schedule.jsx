import { useState } from "react";
import {
  AlertCircle,
  CalendarCheck2,
  Clock,
  RefreshCw,
  Settings2,
} from "lucide-react";
import { api } from "./api";
import {
  Field,
  ErrorMessage,
  Modal,
  formatDate,
  formatTime,
  formatMinutes,
} from "./components";
import { BusyTimes } from "./BusyTimes";
import { SessionCheckIns } from "./SessionCheckIns";
import { TimeCalendar } from "./TimeCalendar";
import { sessionEnded, useCurrentTime } from "./session-status";

const clockLabel = (minutes) =>
  formatTime(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));

export function Schedule({ schedule, edit, onGenerated, notify, adjustment }) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const [settings, setSettings] = useState({
    timezone: zone,
    start_hour: 9,
    end_hour: 22,
    daily_minutes: 180,
    horizon_days: 30,
    ...schedule.settings,
  });
  const [draft, setDraft] = useState(settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [generatedAttempt, setPlanAttempt] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [settingsConflicts, setSettingsConflicts] = useState(null);
  const [calendarVersion, setCalendarVersion] = useState(0);
  const [visibleHours, setVisibleHours] = useState(12);
  const [panel, setPanel] = useState(null);
  const instant = useCurrentTime();
  const planAttempt = adjustment || generatedAttempt;
  const futureCount = schedule.sessions.filter(
    (s) => new Date(s.starts_at).getTime() >= instant,
  ).length;
  const pendingCount = schedule.sessions.filter(
    (s) => s.outcome === "pending" && sessionEnded(s, instant),
  ).length;
  const conflictCount =
    (schedule.conflicts?.length || 0) +
    (schedule.active_conflicts?.length || 0);
  const remaining = schedule.unallocated.reduce((sum, a) => sum + a.minutes, 0);
  const shortfall = remaining > 0 && planAttempt?.unallocated.length > 0;
  const titles = {
    settings: "Plan settings",
    checkins: "Study session check-in",
    conflicts: "Schedule conflicts",
    busy: "Busy time",
    remaining: "Unscheduled work",
  };
  function openSettings() {
    setDraft({ ...settings });
    setError(null);
    setPanel("settings");
  }
  function closePanel() {
    if (!busy) setPanel(null);
  }
  async function applySettings(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api("/schedule/settings", { method: "PUT", body: draft });
      setSettings(result.settings);
      await onGenerated();
      setPanel(null);
      setSettingsConflicts(result.conflicts);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function generate(mode = "all") {
    setConfirm(false);
    setSettingsConflicts(null);
    setBusy(true);
    setError(null);
    try {
      const result = await api(
        mode === "remaining"
          ? "/schedule/fill-remaining"
          : mode === "repair"
            ? "/schedule/repair-conflicts"
            : "/schedule/generate",
        {
          method: "POST",
          body: settings,
        },
      );
      await onGenerated();
      setPlanAttempt(result);
      setPanel(null);
      notify(
        result.unallocated.length
          ? "Some work could not fit. Open Unscheduled work for details."
          : mode === "repair"
            ? "Conflicting sessions rescheduled. Other sessions kept in place."
            : mode === "remaining"
              ? "Remaining study time scheduled. Existing sessions kept in place."
              : "Your study plan is ready.",
      );
      setCalendarVersion((value) => value + 1);
    } catch (e) {
      setError(e);
      setPanel("remaining");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="schedule-shell">
      <section
        className="panel schedule-toolbar"
        aria-label="Study planning tools"
      >
        <div className="schedule-toolbar-main">
          <button
            className={`schedule-backlog ${shortfall ? "needs-attention" : ""}`}
            disabled={busy}
            onClick={() => setPanel("remaining")}
            aria-label="Unscheduled work"
          >
            {shortfall && <AlertCircle size={16} />}
            <strong>{formatMinutes(remaining)}</strong> left to schedule
            {shortfall && (
              <span className="shortfall-label">Could not fit</span>
            )}
          </button>
          <div className="schedule-primary-actions">
            <button
              className="button"
              onClick={() => generate("remaining")}
              disabled={busy || remaining === 0}
              title="Fill missing study time without moving existing sessions"
            >
              <CalendarCheck2 size={16} />
              Schedule remaining
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => (futureCount ? setConfirm(true) : generate())}
              title="Rebuild the future study plan"
            >
              <RefreshCw size={16} className={busy ? "spin" : ""} />
              {busy
                ? "Planning…"
                : futureCount
                  ? "Regenerate plan"
                  : "Generate plan"}
            </button>
          </div>
        </div>
        <div className="schedule-toolbar-secondary">
          <button
            className="schedule-settings-link"
            disabled={busy}
            onClick={openSettings}
            aria-label="Plan settings"
          >
            <Settings2 size={16} />
            <span>Plan settings</span>
          </button>
          <span
            className="schedule-window"
            title={`Planning timezone: ${settings.timezone}`}
          >
            {clockLabel(settings.start_hour * 60)}–{settings.end_hour === 24 ? "24:00" : clockLabel(settings.end_hour * 60)} ·{" "}
            {formatMinutes(settings.daily_minutes)}/day ·{" "}
            {settings.horizon_days} days ·{" "}
            {settings.timezone.replaceAll("_", " ")}
          </span>
          <div className="schedule-panel-links">
            <button
              className={`schedule-chip ${pendingCount ? "needs-attention" : ""}`}
              disabled={busy}
              onClick={() => setPanel("checkins")}
              aria-label="Study session check-in"
            >
              <Clock size={14} />
              Check-in <span>{pendingCount}</span>
            </button>
            <button
              className={`schedule-chip ${conflictCount ? "has-conflicts" : ""}`}
              disabled={busy}
              onClick={() => setPanel("conflicts")}
              aria-label="Schedule conflicts"
            >
              Conflicts <span>{conflictCount}</span>
            </button>
            <button
              className="schedule-chip"
              disabled={busy}
              onClick={() => setPanel("busy")}
              aria-label="Manage busy time"
            >
              Busy time
            </button>
          </div>
        </div>
      </section>
      <TimeCalendar
        visibleHours={visibleHours}
        onVisibleHoursChange={setVisibleHours}
        key={calendarVersion}
        schedule={schedule}
        disabled={busy}
        onEditSession={edit}
        onBusyChanged={async (action) => {
          await onGenerated();
          setPlanAttempt(null);
          notify(
            `Event ${action}. Review any conflicts using the Conflicts button.`,
          );
        }}
      />
      {panel && (
        <Modal
          title={titles[panel]}
          drawer={panel !== "settings"}
          onClose={closePanel}
        >
          {panel === "settings" ? (
            <form onSubmit={applySettings}>
              <div className="modal-body">
                <ErrorMessage error={error} />
                <fieldset disabled={busy} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
                <div className="plan-controls">
                  <Field
                    name="start-hour"
                    label="Start studying at"
                    value={draft.start_hour}
                    onChange={(e) =>
                      setDraft({ ...draft, start_hour: Number(e.target.value), end_hour: Math.max(draft.end_hour, Number(e.target.value) + 1) })
                    }
                  >
                    {Array.from({ length: 21 }, (_, hour) => (
                      <option key={hour} value={hour}>
                        {clockLabel(hour * 60)}
                      </option>
                    ))}
                  </Field>
                  <Field
                    name="end-hour"
                    label="Finish studying by"
                    value={draft.end_hour}
                    onChange={(e) => setDraft({ ...draft, end_hour: Number(e.target.value) })}
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map((hour) => (
                      <option key={hour} value={hour} disabled={hour <= draft.start_hour}>
                        {hour === 24 ? "Midnight (24:00)" : clockLabel(hour * 60)}
                      </option>
                    ))}
                  </Field>
                  <Field
                    name="daily-minutes"
                    label="Time each day"
                    value={draft.daily_minutes}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        daily_minutes: Number(e.target.value),
                      })
                    }
                  >
                    {[30, 60, 90, 120, 180, 240].map((n) => (
                      <option key={n} value={n}>
                        {formatMinutes(n)}
                      </option>
                    ))}
                  </Field>
                  <Field
                    name="horizon-days"
                    label="Plan ahead"
                    value={draft.horizon_days}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        horizon_days: Number(e.target.value),
                      })
                    }
                  >
                    {[7, 14, 30, 60, 90].map((n) => (
                      <option key={n} value={n}>
                        {n} days
                      </option>
                    ))}
                  </Field>
                </div>
                </fieldset>
                <p className="field-hint">
                  Planning timezone: {draft.timezone.replaceAll("_", " ")}. Time each day
                  is your total study budget. Starting at your chosen time, planning skips
                  busy periods and finishes by your chosen end time. Existing study
                  sessions count toward this total; busy time does not.
                </p>
                <p className="field-hint">
                  Apply saves your settings, checks for conflicts and asks whether to regenerate your plan.
                  Sessions stay in place until you choose to regenerate.
                </p>
                <details className="schedule-help">
                  <summary>How planning and the calendar work</summary>
                  <p>
                    Overdue work first, then upcoming work, ordered by deadline
                    and priority. Sessions last up to 30 minutes. Earliest
                    starts, busy times and applicable deadlines are respected.
                  </p>
                  <p>
                    Scroll inside the calendar for all 24 hours; swipe sideways
                    for other days on small screens. Click an empty time to add
                    an event, or use arrow keys between empty times. Overlapping
                    events appear side by side; very short sessions have a
                    minimum visible height.
                  </p>
                </details>
              </div>
              <footer className="modal-footer">
                <button type="button" className="button" onClick={closePanel} disabled={busy}>
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>{busy ? "Applying…" : "Apply settings"}</button>
              </footer>
            </form>
          ) : (
            <div className="schedule-drawer-content">
              {panel === "checkins" && (
                <>
                  {!schedule.sessions.some((s) => sessionEnded(s, instant)) && (
                    <p>No ended study sessions to review yet.</p>
                  )}
                  <SessionCheckIns
                    sessions={schedule.sessions}
                    edit={edit}
                    disabled={busy}
                  />
                </>
              )}
              {panel === "busy" && (
                <BusyTimes
                  rules={schedule.busy_times || []}
                  disabled={busy}
                  onChanged={async () => {
                    await onGenerated();
                    setPlanAttempt(null);
                    notify(
                      "Busy times updated. Review any conflicts using the Conflicts button.",
                    );
                  }}
                />
              )}
              {panel === "conflicts" && (
                <>
                  <ErrorMessage error={error} />
                  {!conflictCount ? (
                    <p>No study sessions overlap your busy time.</p>
                  ) : (
                    <section
                      className="busy-conflicts"
                      aria-labelledby="conflict-heading"
                    >
                      <h2 id="conflict-heading">
                        Study sessions overlap your busy time
                      </h2>
                      {schedule.conflicts?.length > 0 && (
                        <>
                          <p>
                            {schedule.conflicts.length} future sessions need a
                            new time. Rescheduling keeps other sessions in place
                            and uses your plan settings.
                          </p>
                          <ul>
                            {schedule.sessions
                              .filter((s) => schedule.conflicts.includes(s.id))
                              .map((s) => (
                                <li key={s.id}>
                                  {s.assignment_title} ·{" "}
                                  {formatDate(s.starts_at)}{" "}
                                  {formatTime(s.starts_at)} ·{" "}
                                  {formatMinutes(s.minutes)}
                                </li>
                              ))}
                          </ul>
                          <button
                            className="button"
                            disabled={busy}
                            onClick={() => generate("repair")}
                          >
                            {busy
                              ? "Rescheduling…"
                              : "Reschedule conflicting sessions"}
                          </button>
                        </>
                      )}
                      {schedule.active_conflicts?.length > 0 && (
                        <p>
                          {schedule.active_conflicts.length} sessions have
                          already started and overlap busy time. Started
                          sessions stay in your study history and cannot be
                          rescheduled.
                        </p>
                      )}
                    </section>
                  )}
                </>
              )}
              {panel === "remaining" && (
                <>
                  <ErrorMessage error={error} />
                  {remaining === 0 ? (
                    <p>
                      All estimated work is already accounted for. Check-in lets
                      you confirm ended sessions or return missed time to the
                      plan.
                    </p>
                  ) : (
                    <details
                      className={
                        shortfall
                          ? "capacity-note"
                          : "capacity-note planning-note"
                      }
                      open
                    >
                      <summary>
                        {formatMinutes(remaining)}{" "}
                        {shortfall
                          ? "could not fit in the last plan"
                          : "ready to schedule"}
                      </summary>
                      <p>
                        {shortfall
                          ? "Some work could not fit in your available study time after excluding busy times and respecting earliest starts. Overdue work can be scheduled after its deadline; other work must finish before its deadline. Review your study hours, busy times, planning window, or assignment dates."
                          : "Saving an assignment does not automatically schedule it. Choose Schedule remaining to fill the gaps while preserving existing sessions, or Generate / Regenerate plan to rebuild the plan."}
                      </p>
                      <ul>
                        {schedule.unallocated.map((a) => {
                          const reason = planAttempt?.unallocated.find(
                            (item) => item.assignment_id === a.assignment_id,
                          )?.reason;
                          return (
                            <li key={a.assignment_id}>
                              {a.title} — {formatMinutes(a.minutes)}
                              {reason ? ` · ${reason}` : ""}
                            </li>
                          );
                        })}
                      </ul>
                    </details>
                  )}
                </>
              )}
            </div>
          )}
        </Modal>
      )}
      {(confirm || settingsConflicts !== null) && (
        <Modal
          title="Regenerate your study plan?"
          onClose={() => { setConfirm(false); setSettingsConflicts(null); }}
        >
          <div className="modal-body">
            {settingsConflicts !== null && (
              <>
                <p>
                  {settingsConflicts.length
                    ? `Settings applied. ${settingsConflicts.length} future study sessions conflict with your settings or busy time.`
                    : "Settings applied. No conflicts with existing study sessions."}
                  {" "}Regenerate to use the new settings?
                </p>
                {settingsConflicts.length > 0 && <ul>
                  {[
                    ["outside_hours", "Sessions fall outside your study start/end times."],
                    ["daily_budget", "Scheduled study exceeds your daily total, including earlier study that day."],
                    ["outside_window", "Sessions fall outside your selected planning window."],
                    ["busy_time", "Sessions overlap your busy time."],
                  ].filter(([reason]) => settingsConflicts.some((item) => item.reasons.includes(reason)))
                    .map(([reason, label]) => <li key={reason}>{label}</li>)}
                </ul>}
              </>
            )}
            <p>
              This will replace {futureCount} future sessions, including any
              manual changes. Past and active sessions are preserved.
            </p>
          </div>
          <footer className="modal-footer">
            <button className="button" onClick={() => { setConfirm(false); setSettingsConflicts(null); }}>
              {settingsConflicts !== null ? "Keep current plan" : "Cancel"}
            </button>
            <button className="button primary" onClick={() => generate()}>
              Regenerate plan
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
