import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const shell = readFileSync("components/admin-shell.tsx", "utf8");
const css = readFileSync("app/globals.css", "utf8");

/** Every `@media (query) { … }` block for the query, concatenated. */
function mediaBlock(query: string) {
  const blocks: string[] = [];
  let start = css.indexOf(`@media (${query})`);
  assert.ok(start >= 0, `media block ${query} exists`);
  while (start >= 0) {
    let depth = 0, index = css.indexOf("{", start);
    for (; index < css.length; index++) {
      if (css[index] === "{") depth++;
      if (css[index] === "}") { depth--; if (depth === 0) break; }
    }
    blocks.push(css.slice(start, index));
    start = css.indexOf(`@media (${query})`, index);
  }
  return blocks.join("\n");
}

test("Sign out lives in the top bar, which is rendered on every screen size (root cause: it was only in a sidebar footer hidden by the ≤780px media query)", () => {
  // The top bar carries brand, name and Sign out.
  const topbar = shell.slice(shell.indexOf('<header className="admin-topbar">'), shell.indexOf("</header>"));
  assert.match(topbar, /IET · DSMNRU/);
  assert.match(topbar, /admin-topbar-user/);
  assert.match(topbar, /\{user\.name\}/);
  assert.match(topbar, /signOutButton\("mini-button admin-signout"\)/);
  assert.match(shell, /aria-label="Sign out"/);
  // Nothing hides the top bar or its Sign out control at any breakpoint.
  for (const query of ["max-width: 1080px", "max-width: 780px", "max-width: 500px"]) {
    const block = mediaBlock(query);
    assert.doesNotMatch(block, /\.admin-topbar(-actions)?\s*\{[^}]*display:\s*none/, `${query} keeps the top bar`);
    assert.doesNotMatch(block, /\.admin-signout[^{]*\{[^}]*display:\s*none/, `${query} keeps Sign out`);
    assert.doesNotMatch(block, /\.admin-topbar-user\s*\{[^}]*display:\s*none/, `${query} keeps the administrator's name`);
  }
  assert.doesNotMatch(css, /\.admin-sidebar-bottom\s*\{\s*display:\s*none/, "the old hide rule is gone");
  // The top bar is sticky, so Sign out stays reachable while scrolling long forms.
  assert.match(css, /\.admin-topbar \{ position: sticky; top: 0;/);
});

test("the navigation drawer on small screens does not swallow the sign-out control", () => {
  const small = mediaBlock("max-width: 780px");
  assert.match(small, /\.admin-menu-toggle \{ display: inline-flex; \}/);
  assert.match(small, /\.admin-sidebar \{ position: fixed;[^}]*transform: translateX\(-104%\)/);
  assert.match(small, /\.admin-shell\.menu-open \.admin-sidebar \{ transform: none;/);
  // Sign out is offered in the Account group of the drawer as well.
  const nav = shell.slice(shell.indexOf('<nav className="admin-nav"'), shell.indexOf("</nav>"));
  assert.match(nav, /<div className="admin-nav-label">Account<\/div>/);
  assert.match(nav, /signOutButton\("admin-nav-signout"\)/);
  assert.match(shell, /useEffect\(\(\) => \{ setMenuOpen\(false\); \}, \[pathname\]\);/, "the drawer closes on navigation");
});

test("signing out deletes the session on the server and performs a full navigation to the login page", () => {
  assert.match(shell, /await fetch\("\/api\/auth\/logout", \{ method: "POST" \}\)/);
  assert.match(shell, /window\.location\.assign\("\/admin\/login"\)/);
  const logout = readFileSync("app/api/auth/logout/route.ts", "utf8");
  assert.match(logout, /if \(!isSameOrigin\(request\)\)/, "same-origin protection stays");
  assert.match(logout, /await clearSession\(\)/);
  const auth = readFileSync("lib/auth.ts", "utf8");
  assert.match(auth, /export async function clearSession\(\) \{\s*const store = await cookies\(\);\s*store\.delete\(COOKIE_NAME\);/);
  // Without the cookie every /admin page redirects to the login page, and
  // every admin API answers 401 — so the workspace is closed after sign-out.
  const layout = readFileSync("app/admin/layout.tsx", "utf8");
  assert.match(layout, /const user = await getSession\(\);\s*if \(!user\) redirect\("\/admin\/login"\)/);
  assert.match(layout, /export const dynamic = "force-dynamic"/);
  assert.match(auth, /if \(!token\) return null;/);
  assert.match(auth, /if \(user\.sessionVersion !== tokenVersion\) return null;/, "server-side invalidation of stale sessions stays");
});

test("the workspace navigation is grouped by role: Dashboard, Content, Administration, Account", () => {
  const nav = shell.slice(shell.indexOf('<nav className="admin-nav"'), shell.indexOf("</nav>"));
  const order = ["Dashboard", ">Content<", ">Administration<", ">Account<"].map((marker) => nav.indexOf(marker));
  assert.ok(order.every((position) => position >= 0), "all groups are present");
  assert.deepEqual([...order].sort((a, b) => a - b), order, "groups appear in order");
  // Administration is shown only to roles with something to administer.
  assert.match(shell, /const showsAdministration = Boolean\(user && \(canManageUsers\(user\) \|\| canViewAuditLogs\(user\) \|\| visibleAdminSections\(user\)\.includes\("departmentContacts"\) \|\| administrationEntries\.length > 0\)\)/);
  assert.match(nav, /canManageUsers\(user\) && <AdminLink href="\/admin\/users" label="Users"/);
  assert.match(nav, /canViewAuditLogs\(user\) && <AdminLink href="\/admin\/audit" label="Audit log"/);
  // Content sections requested for the handover, in order.
  const content = ["Departments", "Programmes", "Faculty & staff", "Laboratories", "Research", "Projects", "Publications", "Achievements", "Events", "Notices", "Student organizations", "Pages", "Documents (PDF)", "Images"];
  const positions = content.map((label) => shell.indexOf(`"${label}"`));
  assert.ok(positions.every((position) => position >= 0), "every content section is listed");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "content sections keep the requested order");
  // No prototype naming in the workspace chrome.
  assert.doesNotMatch(shell, /Content Studio|Public surface|Workspace<\/div>/);
  assert.doesNotMatch(readFileSync("app/(auth)/admin/login/page.tsx", "utf8"), /Content Studio|demo account|IET CMS/);
});
