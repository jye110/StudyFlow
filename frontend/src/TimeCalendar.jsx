import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Repeat2 } from "lucide-react";
import { api } from "./api";
import { BusyEditor } from "./BusyTimes";
import {
  ErrorMessage,
  formatDate,
  formatTime,
  formatMinutes,
} from "./components";
import { layoutDayEvents } from "./calendar-layout";
import { sessionStatus, useCurrentTime } from "./session-status";

const EMPTY_RULES = [];
const dayLabel = (day) =>
  day.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

export function TimeCalendar({
  schedule,
  onEditSession,
  onBusyChanged,
  disabled,
  visibleHours = 12,
  onVisibleHoursChange,
}) {
  const instant = useCurrentTime();
  const [week, setWeek] = useState(0);
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState([0, 18]);
  const [loaded, setLoaded] = useState(null);
  const [retry, setRetry] = useState(0);
  const scroll = useRef(null);
  const dateHeader = useRef(null);
  const [availableHeight, setAvailableHeight] = useState(480);
  const hourHeight = Math.max(1, availableHeight / visibleHours);
  const labelInterval = hourHeight < 12 ? 3 : hourHeight < 20 ? 2 : 1;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7) + week * 7);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(first);
    date.setDate(date.getDate() + index);
    return date;
  });
  const end = new Date(first);
  end.setDate(end.getDate() + 7);
  const startISO = first.toISOString(),
    endISO = end.toISOString();
  const rules = schedule.busy_times || EMPTY_RULES;
  const rangeKey = `${startISO}/${endISO}/${JSON.stringify(rules)}`;
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  useEffect(() => {
    let active = true;
    api(
      `/calendar-events?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`,
    )
      .then((result) => {
        if (active) setLoaded({ key: rangeKey, events: result.events });
      })
      .catch((error) => {
        if (active) setLoaded({ key: rangeKey, error });
      });
    return () => {
      active = false;
    };
  }, [startISO, endISO, rangeKey, retry]);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() => {
      setAvailableHeight(
        Math.max(
          1,
          scroll.current.clientHeight - dateHeader.current.offsetHeight,
        ),
      );
    });
    observer.observe(scroll.current);
    observer.observe(dateHeader.current);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    scroll.current.scrollTop = (visibleHours === 24 ? 0 : 8) * hourHeight;
  }, [hourHeight, startISO, visibleHours]);
  const personal = loaded?.key === rangeKey ? loaded.events || [] : [];
  const error = loaded?.key === rangeKey ? loaded.error : null;
  const loading = loaded?.key !== rangeKey;
  const events = [
    ...schedule.sessions.map((s) => ({
      ...s,
      id: `session-${s.id}`,
      session: s,
      title: s.assignment_title,
      type: "study",
      ends_at: new Date(
        new Date(s.starts_at).getTime() + s.minutes * 60000,
      ).toISOString(),
    })),
    ...personal.map((event) => ({ ...event, type: "personal" })),
  ];
  function add(day, slot) {
    const start = new Date(day);
    start.setHours(0, slot * 30, 0, 0);
    const finish = new Date(start.getTime() + 30 * 60000);
    setEditor({
      initialRange: { start: start.toISOString(), end: finish.toISOString() },
    });
  }
  function navigateSlot(event, dayIndex, slot) {
    const moves = {
      ArrowUp: [dayIndex, slot - 1],
      ArrowDown: [dayIndex, slot + 1],
      ArrowLeft: [dayIndex - 1, slot],
      ArrowRight: [dayIndex + 1, slot],
      Home: [dayIndex, 0],
      End: [dayIndex, 47],
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    const [d, s] = moves[event.key];
    if (d < 0 || d > 6 || s < 0 || s > 47) return;
    const target = scroll.current.querySelector(
      `.time-slot[data-day="${d}"][data-slot="${s}"]`,
    );
    if (!target?.disabled) {
      setSelected([d, s]);
      target.focus();
    }
  }
  return (
    <section className="panel time-calendar" aria-labelledby="calendar-title">
      <header className="panel-heading time-calendar-heading">
        <div>
          <h2 id="calendar-title">
            {formatDate(first)} – {formatDate(days[6], { year: "numeric" })}
          </h2>
          <p>
            <span>{schedule.sessions.length} sessions in your plan</span> ·{" "}
            {zone.replaceAll("_", " ")}
          </p>
        </div>
        <div
          className="calendar-view-switch"
          role="group"
          aria-label="Visible hours"
        >
          {[6, 12, 24].map((hours) => (
            <button
              key={hours}
              type="button"
              aria-pressed={visibleHours === hours}
              title={`Show ${hours} hours`}
              onClick={() => onVisibleHoursChange(hours)}
            >
              {hours}h
            </button>
          ))}
        </div>
        <div className="calendar-navigation">
          <button
            className="icon-button"
            aria-label="Previous week"
            onClick={() => setWeek(week - 1)}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="button small"
            onClick={() => {
              setWeek(0);
              scroll.current.scrollTop =
                (visibleHours === 24 ? 0 : 8) * hourHeight;
            }}
          >
            Today
          </button>
          <button
            className="icon-button"
            aria-label="Next week"
            onClick={() => setWeek(week + 1)}
          >
            <ChevronRight size={20} />
          </button>
          <button
            className="button primary small"
            disabled={disabled}
            onClick={() => add(week === 0 ? today : first, 18)}
          >
            <Plus size={15} />
            Add event
          </button>
        </div>
      </header>
      <div className="calendar-key">
        <span>
          <i className="study-dot" />
          Study session
        </span>
        <span>
          <i className="personal-dot" />
          Personal event
        </span>
        <span>Click to add · Scroll for other hours</span>
      </div>
      <div className="calendar-zone sr-only">
        {zone.replaceAll("_", " ")} · Scroll for all 24 hours; swipe sideways
        for other days. Use arrow keys between empty times.
      </div>
      {loading && (
        <p className="calendar-load" role="status">
          Loading personal events…
        </p>
      )}
      {error && (
        <div className="calendar-load">
          <ErrorMessage error={error} />
          <button className="button small" onClick={() => setRetry(retry + 1)}>
            Retry events
          </button>
        </div>
      )}
      <div
        className="time-scroll"
        ref={scroll}
        aria-label="Weekly calendar"
        tabIndex={-1}
      >
        <div className="time-week-head" ref={dateHeader}>
          <div className="time-corner">Time</div>
          {days.map((day) => (
            <div
              className={`time-date ${day.getTime() === today.getTime() ? "is-today" : ""}`}
              key={day.toISOString()}
            >
              <span>
                {day.toLocaleDateString(undefined, { weekday: "short" })}
              </span>
              <strong>{day.getDate()}</strong>
            </div>
          ))}
        </div>
        <div
          className="time-week-body"
          style={{ "--hour-height": `${hourHeight}px` }}
        >
          <div className="time-axis" aria-hidden="true">
            {Array.from(
              { length: 24 },
              (_, hour) =>
                hour % labelInterval === 0 && (
                  <span key={hour} style={{ top: hour * hourHeight }}>
                    {String(hour).padStart(2, "0")}:00
                  </span>
                ),
            )}
          </div>
          {days.map((day, dayIndex) => (
            <div
              className={`time-day ${day.getTime() === today.getTime() ? "is-today" : ""}`}
              key={day.toISOString()}
              aria-label={dayLabel(day)}
            >
              {Array.from({ length: 48 }, (_, slot) => {
                const point = new Date(day);
                point.setHours(0, slot * 30, 0, 0);
                const nonexistent =
                  point.getHours() * 60 + point.getMinutes() !== slot * 30;
                return (
                  <button
                    type="button"
                    key={slot}
                    className="time-slot"
                    data-day={dayIndex}
                    data-slot={slot}
                    style={{
                      top: (slot * hourHeight) / 2,
                      height: hourHeight / 2,
                    }}
                    disabled={disabled || nonexistent}
                    tabIndex={
                      selected[0] === dayIndex && selected[1] === slot ? 0 : -1
                    }
                    aria-label={`Add event on ${dayLabel(day)} at ${formatTime(point)}`}
                    onFocus={() => setSelected([dayIndex, slot])}
                    onKeyDown={(event) => navigateSlot(event, dayIndex, slot)}
                    onClick={() => add(day, slot)}
                  />
                );
              })}
              {layoutDayEvents(events, day, hourHeight).map((event) => {
                const conflict =
                  event.type === "study" &&
                  [
                    ...(schedule.conflicts || []),
                    ...(schedule.active_conflicts || []),
                  ].includes(event.session.id);
                const label = `${event.type === "study" ? "Edit session" : "Edit event"} ${event.title} at ${formatTime(event.starts_at)}`;
                const details = `${event.title}\n${formatDate(event.starts_at)} ${formatTime(event.starts_at)} – ${formatDate(event.ends_at)} ${formatTime(event.ends_at)}\n${event.type === "study" ? `${event.session.course.name} · ${formatMinutes(event.session.minutes)}` : event.kind === "weekly" ? "Repeats weekly · edits apply to every occurrence" : "Personal event"}${conflict ? "\nBusy time conflict" : ""}`;
                return (
                  <button
                    key={event.id}
                    type="button"
                    className={`time-event ${event.type} outcome-${event.session?.outcome || "pending"} ${event.height < 36 ? "compact-event" : ""} ${conflict ? "has-conflict" : ""}`}
                    style={{
                      top: event.top,
                      height: event.height,
                      left: `calc(${(event.lane * 100) / event.columns}% + 2px)`,
                      width: `calc(${100 / event.columns}% - 5px)`,
                      "--event-color": event.session?.course.color || "#7c3aed",
                    }}
                    disabled={disabled}
                    aria-label={label}
                    title={`${details}${event.type === "study" ? `\n${sessionStatus(event.session, instant)}` : ""}`}
                    onClick={() => {
                      if (event.type === "study") onEditSession(event.session);
                      else {
                        const record = rules.find(
                          (rule) => rule.id === event.busy_time_id,
                        );
                        if (record) setEditor({ record });
                      }
                    }}
                  >
                    <div className="time-event-heading">
                    <time className="time-event-start" dateTime={event.starts_at}>
                      {new Date(event.starts_at).toLocaleTimeString(undefined, {
                        hour: "2-digit", minute: "2-digit", hourCycle: "h23",
                      })}
                    </time>
                    <strong>
                      {event.type === "study" &&
                      event.session.outcome === "completed"
                        ? "✓ "
                        : event.type === "study" &&
                            event.session.outcome === "missed"
                          ? "✕ "
                          : ""}
                      {event.continuesBefore ? "↳ " : ""}
                      {event.title}
                      {event.continuesAfter ? " ↴" : ""}
                    </strong>
                    </div>
                    {event.height >= 36 && (
                      <span>
                        {formatTime(event.starts_at)}–
                        {formatTime(event.ends_at)}
                      </span>
                    )}
                    {event.height >= 64 && (
                      <small>
                        {event.type === "study" ? (
                          event.session.course.code || event.session.course.name
                        ) : event.kind === "weekly" ? (
                          <>
                            <Repeat2 size={11} />
                            Weekly event
                          </>
                        ) : (
                          "Personal event"
                        )}
                      </small>
                    )}
                    {conflict && event.height >= 80 && (
                      <small>Busy time conflict</small>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="calendar-footnote sr-only">
        Overlapping events appear side by side. Very short sessions use a
        minimum visible height; click to see the exact duration.
      </p>
      {editor && (
        <BusyEditor
          record={editor.record}
          initialRange={editor.initialRange}
          eventMode
          onClose={() => setEditor(null)}
          onSaved={async (action = "saved") => {
            await onBusyChanged(action);
            setEditor(null);
          }}
        />
      )}
    </section>
  );
}
