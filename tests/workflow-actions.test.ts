import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canAccess, entityCapability, workflowActions, workflowTransitionAllowed } from "../lib/content-policy";
import type { PolicyUser } from "../lib/content-policy";

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

test("non-publishing roles: save, submit for review, edit published content; never publish, unpublish or archive", () => {
  for (const user of [{ role: "EDITOR" } as PolicyUser, { role: "DEPARTMENT_ADMIN", departmentId: "dept-1" } as PolicyUser]) {
    const capability = entityCapability(user, "notices", OWN);
    assert.deepEqual(labels(workflowActions(capability, undefined)), ["Save as draft", "Submit for review"], user.role);
    assert.deepEqual(labels(workflowActions(capability, "DRAFT")), ["Save draft", "Submit for review"], user.role);
    assert.deepEqual(labels(workflowActions(capability, "REVIEW")), ["Save changes", "Return to draft"], user.role);
    assert.deepEqual(labels(workflowActions(capability, "PUBLISHED")), ["Save changes"], `${user.role} edits published content`);
    assert.deepEqual(labels(workflowActions(capability, "ARCHIVED")), [], `${user.role} cannot restore archived records`);
  }
  // A role that cannot create the entity gets no buttons for a new record.
  assert.deepEqual(workflowActions(entityCapability({ role: "DEPARTMENT_ADMIN", departmentId: "dept-1" }, "pages"), undefined), []);
});

test("every offered action is accepted by the server policy for that role and state, and nothing the server would accept as a state change is hidden", () => {
  const states = [undefined, "DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;
  const statuses = ["DRAFT", "REVIEW", "PUBLISHED", "ARCHIVED"] as const;
  for (const user of roles) {
    const capability = entityCapability(user, "programs", OWN);
    for (const state of states) {
      const current = state ? { id: "p1", status: state, departmentSlug: OWN } : undefined;
      const offered = workflowActions(capability, state);
      for (const action of offered) {
        const payload = { title: "Edited", departmentSlug: OWN, status: action.status };
        assert.equal(canAccess(user, "programs", "write", payload, current, OWN), true, `${user.role} ${state ?? "new"} → ${action.label} passes canAccess`);
        assert.equal(workflowTransitionAllowed(user, current, action.status), true, `${user.role} ${state ?? "new"} → ${action.label} passes the workflow`);
      }
      // Completeness: every target status the server allows is offered (except
      // ARCHIVED, which stays a deliberate administrative action outside the
      // everyday editor — see PUBLISHED → ARCHIVED in workflow.test.ts).
      for (const target of statuses) {
        if (target === "ARCHIVED") continue;
        const allowed = canAccess(user, "programs", "write", { title: "Edited", departmentSlug: OWN, status: target }, current, OWN) && workflowTransitionAllowed(user, current, target);
        const shown = offered.some((action) => action.status === target);
        assert.equal(shown, allowed, `${user.role} ${state ?? "new"} → ${target}: offered=${shown} allowed=${allowed}`);
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
