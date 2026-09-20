import Link from "next/link";
import { redirect } from "next/navigation";
import { KeyRound, ShieldCheck } from "lucide-react";
import { getSession } from "@/lib/auth";
import { PASSWORD_REQUIREMENT } from "@/lib/password-policy";
import { roleScopeLabel } from "@/lib/user-roles";
import { AccountPasswordForm } from "@/components/account-password-form";

export const dynamic = "force-dynamic";

/**
 * Account & security. Available to every authenticated role: an administrator
 * rotates their own password here instead of asking a super administrator.
 * Only the signed-in account can be changed — there is no account selector.
 */
export default async function AccountPage() {
  const user = await getSession();
  if (!user) redirect("/admin/login");

  return <>
    <div className="entity-toolbar">
      <div>
        <div className="admin-breadcrumb">Workspace / Account</div>
        <h2>Account &amp; security</h2>
        <p className="small">Signed in as <strong>{user.name}</strong> ({user.email}). Role: {user.role.replaceAll("_", " ")} · {roleScopeLabel(user.role, user.departmentId)}. Passwords are hashed and are never displayed to anyone.</p>
      </div>
      <Link href="/admin" className="button secondary small-button">Back to dashboard</Link>
    </div>

    <div className="card-grid two">
      <section className="panel" aria-labelledby="password-change">
        <h3 id="password-change"><KeyRound size={16} aria-hidden="true" /> Change password</h3>
        <p className="small">Enter your current password to confirm the change. Signing in elsewhere with the old password stops working immediately, and every other active session of this account is invalidated.</p>
        <AccountPasswordForm requirement={PASSWORD_REQUIREMENT} />
      </section>

      <section className="panel" aria-labelledby="session-integrity">
        <h3 id="session-integrity"><ShieldCheck size={16} aria-hidden="true" /> Session integrity</h3>
        <ul className="small">
          <li>Passwords are stored only as bcrypt hashes.</li>
          <li>Changing a password increments the account&apos;s session version, which invalidates tokens issued earlier — including sessions on other devices.</li>
          <li>Your current session is re-issued, so you stay signed in here.</li>
          <li>The change is recorded in the audit log as <code>PASSWORD_CHANGED_AND_INVALIDATED_SESSIONS</code> with your account and IP address.</li>
          <li>Sign-in attempts, including this endpoint, are rate limited and return generic messages.</li>
        </ul>
        <p className="small">If you believe another person knows your password, change it here and then use <strong>Sign out</strong> in the sidebar.</p>
      </section>
    </div>
  </>;
}
