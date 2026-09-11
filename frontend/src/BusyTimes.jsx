import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "./api";
import {
  Modal,
  Field,
  ErrorMessage,
  localInput,
  dateISO,
  formatDate,
  formatTime,
} from "./components";

const days = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function BusyEditor({
  record,
  initialRange,
  eventMode = false,
  onClose,
  onSaved,
}) {
  const [values, setValues] = useState(() => ({
    name: record?.name || "",
    kind: record?.kind || "once",
    starts_at: localInput(
      record?.starts_at || initialRange?.start || Date.now() + 3600000,
    ),
    ends_at: localInput(
      record?.ends_at || initialRange?.end || Date.now() + 7200000,
    ),
    weekdays:
      record?.kind === "weekly"
        ? record.weekdays
        : record?.starts_at || initialRange
          ? [
              (new Date(record?.starts_at || initialRange.start).getDay() + 6) %
                7,
            ]
          : [0, 1, 2, 3, 4],
    start_time:
      record?.start_time ||
      (record?.starts_at || initialRange
        ? localInput(record?.starts_at || initialRange.start).slice(11)
        : "12:00"),
    end_time:
      record?.end_time ||
      (record?.ends_at || initialRange
        ? localInput(record?.ends_at || initialRange.end).slice(11)
        : "13:00"),
    timezone:
      record?.timezone ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      "UTC",
  }));
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  async function removeEvent() {
    setSaving(true);
    setError(null);
    try {
      await api(`/busy-times/${record.id}`, { method: "DELETE" });
      await onSaved("deleted");
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  const field = (name, label, props = {}) => (
    <Field
      name={`busy-${name}`}
      label={label}
      value={values[name]}
      error={error?.fields?.[name]}
      onChange={(e) => setValues({ ...values, [name]: e.target.value })}
      {...props}
    />
  );
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/busy-times${record ? `/${record.id}` : ""}`, {
        method: record ? "PATCH" : "POST",
        body: {
          ...values,
          starts_at: values.kind === "once" ? dateISO(values.starts_at) : null,
          ends_at: values.kind === "once" ? dateISO(values.ends_at) : null,
        },
      });
      await onSaved();
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  if (confirmDelete)
    return (
      <Modal
        title={eventMode ? "Delete event?" : "Delete busy time?"}
        onClose={() => {
          if (!saving) setConfirmDelete(false);
        }}
      >
        <div className="modal-body">
          <ErrorMessage error={error} />
          <p>
            Delete <strong>{record.name || "this personal event"}</strong>?
          </p>
          <p className="muted">
            {record.kind === "weekly"
              ? "This deletes the entire repeating series. "
              : ""}
            Its time will be available for future study planning. Existing study
            sessions stay in place.
          </p>
        </div>
        <footer className="modal-footer">
          <button
            className="button"
            disabled={saving}
            onClick={() => setConfirmDelete(false)}
          >
            Cancel
          </button>
          <button
            className="button danger"
            disabled={saving}
            onClick={removeEvent}
          >
            {saving
              ? "Deleting…"
              : eventMode
                ? "Delete event"
                : "Delete busy time"}
          </button>
        </footer>
      </Modal>
    );
  return (
    <Modal
      title={
        eventMode
          ? record
            ? "Edit event"
            : "Add event"
          : record
            ? "Edit busy time"
            : "Add busy time"
      }
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <form className="busy-form" onSubmit={save} noValidate>
        <div className="modal-body">
          <ErrorMessage error={error} />
          {eventMode && (
            <p className="field-hint">
              Personal events block study time. Your planner will avoid this
              time.
            </p>
          )}
          {record?.kind === "weekly" && (
            <p className="field-hint">
              Editing this repeating event updates every occurrence.
            </p>
          )}
          {field("name", "Name (optional)", {
            autoFocus: true,
            maxLength: 120,
            placeholder: "e.g. Lunch, work, or an outing",
          })}
          {field("kind", "Repeat", {
            children: (
              <>
                <option value="once">Does not repeat</option>
                <option value="weekly">Every week</option>
              </>
            ),
          })}
          {values.kind === "once" ? (
            <div className="form-grid">
              {field("starts_at", eventMode ? "Event start" : "Busy start", {
                type: "datetime-local",
              })}
              {field("ends_at", eventMode ? "Event end" : "Busy end", {
                type: "datetime-local",
              })}
            </div>
          ) : (
            <>
              <fieldset
                className="busy-weekdays"
                aria-describedby={
                  error?.fields?.weekdays ? "busy-weekdays-error" : undefined
                }
              >
                <legend>Repeat on</legend>
                <div>
                  {days.map((day, index) => (
                    <label key={day}>
                      <input
                        type="checkbox"
                        checked={values.weekdays.includes(index)}
                        onChange={(e) =>
                          setValues({
                            ...values,
                            weekdays: e.target.checked
                              ? [...values.weekdays, index].sort()
                              : values.weekdays.filter(
                                  (value) => value !== index,
                                ),
                          })
                        }
                      />
                      {day}
                    </label>
                  ))}
                </div>
                {error?.fields?.weekdays && (
                  <span id="busy-weekdays-error" className="field-error">
                    {error.fields.weekdays}
                  </span>
                )}
              </fieldset>
              <div className="form-grid">
                {field("start_time", "Busy start time", { type: "time" })}
                {field("end_time", "Busy end time", { type: "time" })}
              </div>
              <p className="field-hint">
                An end time earlier than the start continues into the next day.
                Repeats in {values.timezone.replaceAll("_", " ")}, including
                daylight-saving changes.
              </p>
            </>
          )}
          <p className="field-hint">
            {values.kind === "once"
              ? "Dates and times are shown in your local timezone. "
              : ""}
            Saving keeps your study sessions in place and flags any conflicts
            for you to reschedule.
          </p>
        </div>
        <footer className="modal-footer">
          {record && (
            <button
              type="button"
              className="button danger session-delete"
              disabled={saving}
              onClick={() => {
                setError(null);
                setConfirmDelete(true);
              }}
            >
              {eventMode ? "Delete event" : "Delete busy time"}
            </button>
          )}
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={saving}>
            {saving ? "Saving…" : eventMode ? "Save event" : "Save busy time"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function description(rule) {
  if (rule.kind === "once")
    return `${formatDate(rule.starts_at, { year: "numeric" })}, ${formatTime(rule.starts_at)} – ${formatDate(rule.ends_at, { year: "numeric" })}, ${formatTime(rule.ends_at)}`;
  return `${rule.weekdays.map((day) => days[day].slice(0, 3)).join(", ")} · ${rule.start_time}–${rule.end_time}${rule.end_time < rule.start_time ? " (next day)" : ""} · ${rule.timezone.replaceAll("_", " ")}`;
}

export function BusyTimes({ rules, onChanged, disabled }) {
  const [editor, setEditor] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  async function changed() {
    await onChanged();
    setEditor(null);
  }
  async function remove() {
    setSaving(true);
    setError(null);
    try {
      await api(`/busy-times/${deleting.id}`, { method: "DELETE" });
      await onChanged();
      setDeleting(null);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="panel busy-panel" aria-labelledby="busy-heading">
      <header className="panel-heading">
        <div>
          <h2 id="busy-heading">Busy time</h2>
          <p>Keep meals, work, and personal plans free from study sessions.</p>
        </div>
        <button
          className="button"
          disabled={disabled}
          onClick={() => setEditor({ record: null })}
        >
          <Plus size={16} />
          Add busy time
        </button>
      </header>
      {rules.length ? (
        <ul className="busy-list">
          {rules.map((rule) => (
            <li key={rule.id}>
              <div>
                <strong>{rule.name || "Personal arrangement"}</strong>
                <p>{description(rule)}</p>
              </div>
              <div className="row-actions">
                <button
                  className="icon-button"
                  disabled={disabled}
                  aria-label={`Edit busy time ${rule.name || "Personal arrangement"}`}
                  onClick={() => setEditor({ record: rule })}
                >
                  <Pencil size={16} />
                </button>
                <button
                  className="icon-button"
                  disabled={disabled}
                  aria-label={`Delete busy time ${rule.name || "Personal arrangement"}`}
                  onClick={() => {
                    setError(null);
                    setDeleting(rule);
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="busy-empty">
          Add a one-time arrangement or choose the weekdays for a repeating one.
          You can add several busy times each day.
        </p>
      )}
      {editor && (
        <BusyEditor
          record={editor.record}
          onClose={() => setEditor(null)}
          onSaved={changed}
        />
      )}
      {deleting && (
        <Modal
          title="Delete busy time?"
          onClose={() => {
            if (!saving) setDeleting(null);
          }}
        >
          <div className="modal-body">
            <ErrorMessage error={error} />
            <p>
              Remove{" "}
              <strong>{deleting.name || "this personal arrangement"}</strong>?
              This time will be available when you next generate or repair your
              study plan.
            </p>
          </div>
          <footer className="modal-footer">
            <button
              className="button"
              disabled={saving}
              onClick={() => setDeleting(null)}
            >
              Cancel
            </button>
            <button
              className="button danger"
              disabled={saving}
              onClick={remove}
            >
              {saving ? "Deleting…" : "Delete busy time"}
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
