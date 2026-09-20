"use client";

import { useState } from "react";

/**
 * Self-service password change form, used by every role on /admin/account.
 *
 * The client mirrors the shared password policy for immediate feedback only —
 * the API re-validates everything (policy, current password, rate limit) on the
 * server, and only the signed-in account can ever be changed.
 */
export function AccountPasswordForm({ requirement }: { requirement: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmPassword) { setError("The new password and its confirmation do not match."); return; }
    if (currentPassword === newPassword) { setError("Choose a password you have not used here before."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Unable to change the password."); return; }
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
      setMessage("Password changed. Your other sessions were signed out and this session stays active.");
    } catch {
      setError("Unable to change the password. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return <form onSubmit={submit} style={{ marginTop: 14 }}>
    {error && <div className="alert" role="alert">{error}</div>}
    {message && <div className="alert" role="status" style={{ borderColor: "#bcd7c2", background: "#f2fbf4", color: "var(--ink)" }}>{message}</div>}
    <div className="form-field">
      <label htmlFor="current-password">Current password</label>
      <input id="current-password" className="form-control" type="password" autoComplete="current-password" required maxLength={200} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
    </div>
    <div className="form-field">
      <label htmlFor="new-password">New password</label>
      <input id="new-password" className="form-control" type="password" autoComplete="new-password" required maxLength={200} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
      <p className="form-hint">{requirement}</p>
    </div>
    <div className="form-field">
      <label htmlFor="confirm-password">Confirm new password</label>
      <input id="confirm-password" className="form-control" type="password" autoComplete="new-password" required maxLength={200} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
    </div>
    <button className="button" disabled={busy}>{busy ? "Updating…" : "Change password"}</button>
  </form>;
}
