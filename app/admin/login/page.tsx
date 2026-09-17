"use client";

import Link from "next/link";
import { ArrowLeft, LockKeyhole } from "lucide-react";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) { setError(body.error || "Sign in failed"); return; }
      router.push("/admin");
      router.refresh();
    } catch { setError("Unable to reach the sign-in service."); }
    finally { setLoading(false); }
  }
  return <main className="login-page"><div className="login-card"><Link href="/" className="link-arrow"><ArrowLeft size={15} /> Public site</Link><div className="wordmark" style={{ marginTop: 28 }}><span className="wordmark-mark">IET</span><span className="wordmark-title"><strong>Content Studio</strong><span>Administrator access</span></span></div><h1>Sign in to IET CMS.</h1><p className="lead" style={{ fontSize: ".93rem" }}>Manage institutional content, workflow, links, documents and audit records.</p>{error && <div className="alert" role="alert">{error}</div>}<form onSubmit={submit}><div className="form-field"><label htmlFor="email">Email</label><input id="email" className="form-control" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div><div className="form-field"><label htmlFor="password">Password</label><input id="password" className="form-control" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div><button className="button" style={{ width: "100%", marginTop: 21 }} disabled={loading}><LockKeyhole size={16} /> {loading ? "Signing in…" : "Sign in"}</button></form><div className="login-note"><strong>Institutional access only</strong><br />Use credentials issued by the IET / DSMNRU platform administrator. The production deployment does not contain a shared demo account.</div></div></main>;
}
