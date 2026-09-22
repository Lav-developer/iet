/**
 * Role-dependent department assignment for administrator accounts.
 *
 * The RBAC model does not assume that every administrator belongs to a
 * department:
 *
 * - SUPER_ADMIN      → departmentId must be null (institution-wide)
 * - IET_ADMIN        → departmentId must be null (institution/IET-wide)
 * - DEPARTMENT_ADMIN → departmentId is REQUIRED and must be an existing department
 * - EDITOR           → departmentId is null under the current role model
 *
 * Only the *stored internal department id* is persisted; the administrator
 * selects a department by name in the UI. This module is pure apart from the
 * injected existence check, so every rule is exercised behaviorally in tests.
 */
export const adminRoles = ["SUPER_ADMIN", "IET_ADMIN", "DEPARTMENT_ADMIN", "EDITOR"] as const;
export type AdminRole = (typeof adminRoles)[number];

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (adminRoles as readonly string[]).includes(value);
}

/** Only department administrators are scoped to a department. */
export function departmentScopedRole(role: string): boolean {
  return role === "DEPARTMENT_ADMIN";
}

/** Human-readable scope for the account list. */
export function roleScopeLabel(role: string, departmentName?: string | null): string {
  return departmentScopedRole(role) ? departmentName || "Department not assigned" : "Institute-wide";
}

export type DepartmentAssignment =
  | { ok: true; departmentId: string | null }
  | { ok: false; error: string };

const DEPARTMENT_REQUIRED = "A department is required for department administrators.";
const DEPARTMENT_NOT_FOUND = "Department not found.";
const DEPARTMENT_NOT_ALLOWED = "Department assignment is only valid for department administrators; this role is institute-wide.";

const normalize = (value: string | null | undefined) => (typeof value === "string" && value.trim() ? value.trim() : null);

/**
 * Resolve the department id that must be stored for the resulting role.
 *
 * `departmentId` is the requested value (undefined means "unchanged"), and
 * `currentDepartmentId` is the stored value for an existing account. When the
 * resulting role is institute-wide the assignment resolves to `null`, so
 * switching a department administrator to an institute-wide role clears the
 * stale scope instead of silently keeping it.
 */
export async function resolveDepartmentAssignment(
  input: { role: string; departmentId?: string | null; currentDepartmentId?: string | null },
  departmentExists: (id: string) => Promise<boolean>,
): Promise<DepartmentAssignment> {
  const requested = normalize(input.departmentId);

  if (!departmentScopedRole(input.role)) {
    // An institute-wide role can never hold a scope. Omitting the field on an
    // update clears any previous value instead of silently keeping it.
    if (requested) return { ok: false, error: DEPARTMENT_NOT_ALLOWED };
    return { ok: true, departmentId: null };
  }

  // Only the department-scoped role falls back to the stored value, and only
  // when the field is omitted entirely (an unchanged account keeps its scope).
  // An explicit null/empty value is a rejected request to clear it.
  const assigned = input.departmentId === undefined ? normalize(input.currentDepartmentId) : requested;
  if (!assigned) return { ok: false, error: DEPARTMENT_REQUIRED };
  if (!(await departmentExists(assigned))) return { ok: false, error: DEPARTMENT_NOT_FOUND };
  return { ok: true, departmentId: assigned };
}

/**
 * Roles an actor may offer when creating or editing an account. This is the
 * same rule the users API applies (`permitted()` + the super-admin grant
 * check), expressed once so the form cannot offer a role the API would reject.
 */
export function adminRolesFor(actor: { role: string } | null | undefined, currentRole?: string): AdminRole[] {
  if (actor?.role === "SUPER_ADMIN") {
    // A super administrator may keep (but not create) an account in any role.
    return currentRole && isAdminRole(currentRole) && !adminRoles.includes(currentRole) ? [...adminRoles, currentRole] : [...adminRoles];
  }
  if (actor?.role === "IET_ADMIN") return adminRoles.filter((role) => role !== "SUPER_ADMIN");
  return currentRole && isAdminRole(currentRole) ? [currentRole] : [];
}

/**
 * Whether an actor may modify a target account at all (the API's `permitted()`):
 * SUPER_ADMIN may manage every account; IET_ADMIN may not touch a
 * SUPER_ADMIN account; no other role manages users.
 */
export function canActOnAccount(actor: { role: string } | null | undefined, target: { role: string }): boolean {
  if (actor?.role === "SUPER_ADMIN") return true;
  return actor?.role === "IET_ADMIN" && target.role !== "SUPER_ADMIN";
}

/**
 * Whether the signed-in actor may deactivate (or reactivate) a target account:
 * an actor never changes its own status, and the target must be one the actor
 * is allowed to modify at all.
 */
export function canDeactivateAccount(actor: { id: string; role: string } | null | undefined, target: { id: string; role: string }): boolean {
  if (!actor || actor.id === target.id) return false;
  return canActOnAccount(actor, target);
}

/** Whether the actor may grant the given role (mirrors the API's grant rule). */
export function canGrantRole(actor: { role: string } | null | undefined, role: string): boolean {
  if (!isAdminRole(role)) return false;
  if (actor?.role === "SUPER_ADMIN") return true;
  return actor?.role === "IET_ADMIN" && role !== "SUPER_ADMIN";
}

/** Only the two institute-wide administrator roles manage accounts at all. */
export function canManageAccounts(actor: { role: string } | null | undefined): boolean {
  return actor?.role === "SUPER_ADMIN" || actor?.role === "IET_ADMIN";
}

/**
 * Whether the actor may change the *role* of a target account: the target
 * must be manageable, and nobody changes their own role (a super administrator
 * demoting themselves could leave the institute without one; another super
 * administrator must do it).
 */
export function canChangeAccountRole(actor: { id: string; role: string } | null | undefined, target: { id: string; role: string }): boolean {
  if (!actor || actor.id === target.id) return false;
  return canActOnAccount(actor, target);
}

export type AccountChange = { name?: string; password?: string; role?: string; departmentId?: string | null; active?: boolean };
export type AccountDecision = { ok: true } | { ok: false; status: 400 | 403; error: string };

export const ACCOUNT_ERRORS = {
  forbidden: "Forbidden",
  notManageable: "You cannot modify this administrator. Only a super administrator can change a super administrator account.",
  createSuperAdmin: "IET administrators cannot create super administrators.",
  grantSuperAdmin: "IET administrators cannot grant super administrator access.",
  unknownRole: "Unknown role.",
  selfDeactivate: "Use sign out instead of deactivating your current account.",
  selfRole: "You cannot change your own role. Ask a super administrator to change it.",
  cannotDeactivate: "You cannot deactivate this account.",
} as const;

const refuse = (status: 400 | 403, error: string): AccountDecision => ({ ok: false, status, error });

/** The users API's create rule: only account managers, and IET_ADMIN never creates a SUPER_ADMIN. */
export function authorizeAccountCreation(actor: { id: string; role: string } | null | undefined, role: string): AccountDecision {
  if (!canManageAccounts(actor)) return refuse(403, ACCOUNT_ERRORS.forbidden);
  if (!isAdminRole(role)) return refuse(400, ACCOUNT_ERRORS.unknownRole);
  if (!canGrantRole(actor, role)) return refuse(403, ACCOUNT_ERRORS.createSuperAdmin);
  return { ok: true };
}

/**
 * The users API's update rule, evaluated on the stored target (never on the
 * client's idea of it) before anything is written:
 *
 * 1. only SUPER_ADMIN / IET_ADMIN manage accounts;
 * 2. the target must be manageable — an IET_ADMIN can change nothing on a
 *    SUPER_ADMIN account, not the role, not the password, not the name or
 *    status;
 * 3. a role may only be set if the actor could grant it (IET_ADMIN never
 *    grants SUPER_ADMIN, so an IET_ADMIN cannot escalate any account);
 * 4. an actor never deactivates itself or changes its own role.
 */
export function authorizeAccountUpdate(actor: { id: string; role: string } | null | undefined, target: { id: string; role: string }, change: AccountChange): AccountDecision {
  if (!actor || !canManageAccounts(actor)) return refuse(403, ACCOUNT_ERRORS.forbidden);
  if (!canActOnAccount(actor, target)) return refuse(403, ACCOUNT_ERRORS.notManageable);
  if (change.role !== undefined) {
    if (!isAdminRole(change.role)) return refuse(400, ACCOUNT_ERRORS.unknownRole);
    if (!canGrantRole(actor, change.role)) return refuse(403, ACCOUNT_ERRORS.grantSuperAdmin);
  }
  if (actor.id === target.id) {
    if (change.active === false) return refuse(400, ACCOUNT_ERRORS.selfDeactivate);
    if (change.role !== undefined && change.role !== target.role) return refuse(400, ACCOUNT_ERRORS.selfRole);
  }
  return { ok: true };
}

/** The users API's deactivate rule: a manageable target that is not the actor itself. */
export function authorizeAccountDeactivation(actor: { id: string; role: string } | null | undefined, target: { id: string; role: string }): AccountDecision {
  if (!canManageAccounts(actor)) return refuse(403, ACCOUNT_ERRORS.forbidden);
  if (!canDeactivateAccount(actor, target)) return refuse(403, ACCOUNT_ERRORS.cannotDeactivate);
  return { ok: true };
}
