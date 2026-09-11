import { useState } from "react";
import { api } from "./api";
import { Modal, Field, ErrorMessage } from "./components";

export function ChangePassword({ onClose, onSaved }) {
  const [values, setValues] = useState({ current_password: "", new_password: "", confirm_password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError(null);
    if (values.new_password !== values.confirm_password) {
      setError({ message: "Passwords do not match.", fields: { confirm_password: "Enter the same new password." } });
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", { method: "POST", body: values });
      onSaved();
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Change password" onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <p className="muted">Use 10–128 characters. Other devices will be signed out; you will stay signed in here.</p>
          <ErrorMessage error={error} />
          {[
            ["current_password", "Current password", "current-password"],
            ["new_password", "New password", "new-password"],
            ["confirm_password", "Confirm new password", "new-password"],
          ].map(([name, label, autoComplete]) => (
            <Field key={name} name={name} label={label} type="password" autoComplete={autoComplete}
              required minLength={10} maxLength={128} disabled={busy} value={values[name]}
              error={error?.fields?.[name]}
              onChange={(event) => setValues({ ...values, [name]: event.target.value })} />
          ))}
        </div>
        <footer className="modal-footer">
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
        </footer>
      </form>
    </Modal>
  );
}
