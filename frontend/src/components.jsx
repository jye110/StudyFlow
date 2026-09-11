import { useEffect, useRef, useId } from "react";
import { X, Plus, BookOpen, Check, Clock, AlertCircle } from "lucide-react";

export function Logo() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <i />
        <i />
        <i />
      </span>
      <span>
        StudyFlow<span className="brand-dot">.</span>
      </span>
    </div>
  );
}

export function Modal({ title, children, onClose, wide = false, drawer = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previouslyFocused = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previouslyFocused?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? " wide" : ""}${drawer ? " schedule-drawer" : ""}`}
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.target.closest("dialog") !== event.currentTarget) return;
        if (event.key !== "Tab") return;
        const controls = [
          ...ref.current.querySelectorAll(
            "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary",
          ),
        ];
        const first = controls[0],
          last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        }
        if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.stopPropagation();
        event.preventDefault();
        onClose();
      }}
    >
      <header className="modal-header">
        <h2 id={titleId}>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export function Field({ label, name, error, hint, children, ...props }) {
  const description = error
    ? `${name}-error`
    : hint
      ? `${name}-hint`
      : undefined;
  const shared = {
    id: name,
    name,
    "aria-invalid": !!error,
    "aria-describedby": description,
    ...props,
  };
  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {children ? (
        <select {...shared}>{children}</select>
      ) : props.multiline ? (
        <textarea {...shared} multiline={undefined} rows={3} />
      ) : (
        <input {...shared} />
      )}
      {error && (
        <span className="field-error" id={`${name}-error`}>
          {error}
        </span>
      )}
      {!error && hint && (
        <span className="field-hint" id={`${name}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

export function ErrorMessage({ error }) {
  return error ? (
    <div role="alert" className="error-message">
      <AlertCircle size={18} />
      <span>{error.message || error}</span>
    </div>
  ) : null;
}

export function Empty({
  title,
  text,
  action,
  actionLabel,
  icon: Icon = BookOpen,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button primary" onClick={action}>
          <Plus size={17} />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function Status({ value, overdue = false }) {
  const Icon = overdue ? AlertCircle : value === "Completed" ? Check : Clock;
  return (
    <span
      className={`badge ${overdue ? "overdue" : value.toLowerCase().replaceAll(" ", "-")}`}
    >
      <Icon size={12} />
      {overdue ? "Overdue" : value}
    </span>
  );
}

export const formatMinutes = (value) =>
  value < 60
    ? `${value} min`
    : `${Math.floor(value / 60)}h${value % 60 ? ` ${value % 60}m` : ""}`;
export const formatDate = (value, options = {}) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...options,
  });
export const formatTime = (value) =>
  new Date(value).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
export function localInput(value) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
export function dateISO(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
