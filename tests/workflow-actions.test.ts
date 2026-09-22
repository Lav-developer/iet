import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccess, entityCapability, workflowActions, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser, PublishScope } from "../lib/content-policy";

/**
 * The editor offers plain buttons (Save as draft · Publish · Submit for
 * review · Save changes · Unpublish · Restore as draft) instead of a status
 * select. Every button must be one the server accepts for the same role and
 * record state, and a role must never be offered a button the server refuses.
 */

const roles: PolicyUser[] = [
  { role: "SUPER_ADMIN" },
  { role: "IET_ADMIN" },
  { role: "EDITOR" },
  { role: "DEPARTMENT_ADMIN", departmentId: "dept-1" },
];
const OWN = "computer-science-engineering";
const labels = (actions: ReturnType<typeof workflowActions>) => actions.map((action) => action.label);

test("publishing roles: publish directly from new, draft or review; unpublish; restore", () => {
  const capability = entityCapability({ role: "IET_ADMIN" }, "notices");
  assert.deepEqual(labels(workflowActions(capability, undefined)), ["Save as draft", "Publish", "Submit for review"]);
  assert.deepEqual(labels(workflowActions(capability, "DRAFT")), ["Save draft", "Publish", "Submit for review"]);
  assert.deepEqual(labels(workflowActions(capability, "REVIEW")), ["Save changes", "Publish", "Return to draft"]);
  assert.deepEqual(labels(workflowActions(capability, "PUBLISHED")), ["Save changes", "Unpublish"]);
  assert.deepEqual(labels(workflowActions(capability, "ARCHIVED")), ["Restore as draft"]);
  // Publish is the primary action and asks for confirmation; unpublish asks too.
  const publish = workflowActions(capability, "DRAFT").find((action) => action.label === "Publish");
  assert.equal(publish?.kind, "primary");
  assert.match(publish?.confirm || "", /public website/);
  assert.match(workflowActions(capability, "PUBLISHED").find((action) => action.label === "Unpublish")?.confirm || "", /Remove this record from the public website/);
  // Saving a published record keeps it published: the change goes live.
  assert.equal(workflowActions(capability, "PUBLISHED")[0].status, "PUBLISHED");
});

test("department administrator: the full workflow inside the own department; nothing to publish without a resolvable department", () => {
  const own = entityCapability({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "notices", OWN);
  assert.deepEqual(labels(workflowActions(own, undefined)), ["Save as draft", "Publish", "Submit for review"]);
  assert.deepEqual(labels(workflowActions(own, "DRAFT")), ["Save draft", "Publish", "Submit for review"]);
  assert.deepEqual(labels(workflowActions(own, "REVIEW")), ["Save changes", "Publish", "Return to draft"]);
  assert.deepEqual(labels(workflowActions(own, "PUBLISHED")), ["Save changes", "Unpublish"]);
  assert.deepEqual(labels(workflowActions(own, "ARCHIVED")), ["Restore as draft"]);
  // The department is resolved on the server from the account; without it the
  // server refuses every write, so the editor offers nothing at all.
  const unresolved = entityCapability({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "notices");
  for (const state of [undefined, "DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const) assert.deepEqual(labels(workflowActions(unresolved, state)), [], `unresolved department, ${state ?? "new"}`);
  // A role that cannot create the entity gets no buttons for a new record.
  assert.deepEqual(workflowActions(entityCapability({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "pages", OWN), undefined), []);
});

test("editor: publishes directly within the editorial scope and edits published content; never unpublishes, archives or restores", () => {
  for (const entity of ["notices", "pages"] as const) {
    const capability = entityCapability({ role: "EDITOR" }, entity);
    assert.deepEqual(labels(workflowActions(capability, undefined)), ["Save as draft", "Publish", "Submit for review"], entity);
    assert.deepEqual(labels(workflowActions(capability, "DRAFT")), ["Save draft", "Publish", "Submit for review"], entity);
    assert.deepEqual(labels(workflowActions(capability, "REVIEW")), ["Save changes", "Publish", "Return to draft"], entity);
    assert.deepEqual(labels(workflowActions(capability, "PUBLISHED")), ["Save changes"], `${entity}: edits published content, no Unpublish`);
    assert.equal(workflowActions(capability, "PUBLISHED")[0].status, "PUBLISHED", "the edit keeps the record live");
    assert.deepEqual(labels(workflowActions(capability, "ARCHIVED")), [], `${entity}: cannot restore archived records`);
  }
});

test("every offered action is accepted by the server policy for that role and state, and nothing the server would accept as a state change is hidden", () => {
  const states = [undefined, "DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;
  const statuses = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;
  // The same cases the server sees: a department-scoped entity with the
  // account's department resolved (or not), and institution-wide content.
  const cases: { entity: "programs" | "pages"; assigned?: string }[] = [
    { entity: "programs", assigned: OWN },
    { entity: "programs", assigned: undefined },
    { entity: "pages", assigned: OWN },
  ];
  for (const user of roles) {
    for (const { entity, assigned } of cases) {
      const capability = entityCapability(user, entity, assigned);
      const departmentSlug = entity === "programs" ? OWN : undefined;
      // Exactly the scope app/api/admin/content/route.ts builds for the request.
      const scope: PublishScope = { entity, departmentSlug, assignedDepartmentSlug: assigned };
      for (const state of states) {
        const current = state ? { id: "p1", status: state, departmentSlug } : undefined;
        const offered = workflowActions(capability, state);
        const label = `${user.role} ${entity}/${assigned ?? "unresolved"} ${state ?? "new"}`;
        for (const action of offered) {
          const payload = { title: "Edited", departmentSlug, status: action.status };
          assert.equal(canAccess(user, entity, "write", payload, current, assigned), true, `${label} → ${action.label} passes canAccess`);
          assert.equal(workflowTransitionAllowed(user, current, action.status, scope), true, `${label} → ${action.label} passes the workflow`);
        }
        // Completeness: every target status the server allows is offered (except
        // ARCHIVED, which stays a deliberate administrative action outside the
        // everyday editor — see PUBLISHED → ARCHIVED in workflow.test.ts).
        for (const target of statuses) {
          if (target === "ARCHIVED") continue;
          const allowed = canAccess(user, entity, "write", { title: "Edited", departmentSlug, status: target }, current, assigned) && workflowTransitionAllowed(user, current, target, scope);
          const shown = offered.some((action) => action.status === target);
          assert.equal(shown, allowed, `${label} → ${target}: offered=${shown} allowed=${allowed}`);
        }
      }
    }
  }
});

test("the editor renders workflow buttons from the shared policy, never a raw status select", () => {
  const editor = readFileSync("components/entity-manager.tsx", "utf8");
  assert.match(editor, /workflowActions\(capability, currentStatus\)/);
  assert.doesNotMatch(editor, /type: "status"/, "no status select field remains");
  assert.doesNotMatch(editor, /<option>DRAFT<\/option>|<option>PUBLISHED<\/option>/);
  assert.match(editor, /if \(action\.confirm && !window\.confirm\(action\.confirm\)\) return;/, "confirmation before public-facing changes");
  assert.match(editor, /Delete “\$\{titleFor\(record\)\}” permanently\?/, "deletion is confirmed with the record name");
  // Plain-language status names and outcomes.
  for (const label of ["Draft", "In review", "Published", "Archived"]) assert.ok(editor.includes(`"${label}"`), `status label ${label}`);
  assert.match(editor, /Published\. The record is now on the public website\./);
  assert.match(editor, /Changes saved\. They are live on the public website\./);
});
