import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { departmentContacts } from "../lib/public-content";
import { MAX_DEPARTMENT_CONTACTS, canConfigureDepartmentContacts, validateDepartmentContacts } from "../lib/content-policy";
import { seedData } from "../data/seed";
import type { Department, FacultyMember } from "../lib/types";

// tsx uses the classic transform for the repository's Next-managed JSX setting.
Object.assign(globalThis, { React });

const person = (overrides: Partial<FacultyMember> = {}): FacultyMember => ({
  id: "p-1",
  slug: "person-one",
  name: "Person One",
  designation: "Assistant Professor",
  departmentSlug: "cse",
  type: "FACULTY",
  status: "PUBLISHED",
  email: "one@example.test",
  phone: "9000000001",
  ...overrides,
});

const department = (contacts: Department["contacts"]): Pick<Department, "slug" | "contacts"> => ({ slug: "cse", contacts });

// A department whose faculty list is NOT ordered by responsibility: the first
// row returned is a plain assistant professor, exactly like the reported bug.
const faculty = [
  person({ id: "p-first", slug: "first-row", name: "Dr. Chandrajeet Yadav" }),
  person({ id: "p-incharge", slug: "adarsh-vardhan-srivastava", name: "Mr. Adarsh Vardhan Srivastava", designation: "Assistant Professor · Department In-Charge" }),
  person({ id: "p-hod", slug: "hod-person", name: "Dr. Head Of Department", designation: "Professor" }),
  person({ id: "p-coord", slug: "coordinator-person", name: "Dr. Akanksha Coordinator", designation: "Assistant Professor (Coordinator)" }),
];

test("a configured Coordinator is shown as the department contact", () => {
  const contacts = departmentContacts(department([{ role: "Coordinator", facultySlug: "coordinator-person" }]), faculty);
  assert.equal(contacts.length, 1);
  assert.equal(contacts[0].role, "Coordinator");
  assert.equal(contacts[0].person.slug, "coordinator-person");
});

test("a configured Department In-Charge is shown as the department contact", () => {
  const contacts = departmentContacts(department([{ role: "Department In-Charge", facultySlug: "adarsh-vardhan-srivastava" }]), faculty);
  assert.equal(contacts[0].role, "Department In-Charge");
  assert.equal(contacts[0].person.name, "Mr. Adarsh Vardhan Srivastava");
});

test("a configured Head of Department is shown as the department contact", () => {
  const contacts = departmentContacts(department([{ role: "Head of Department", facultySlug: "hod-person" }]), faculty);
  assert.equal(contacts[0].role, "Head of Department");
  assert.equal(contacts[0].person.name, "Dr. Head Of Department");
});

test("any other configured responsibility is shown exactly as configured", () => {
  const contacts = departmentContacts(department([{ role: "Programme Coordinator", facultySlug: "coordinator-person" }]), faculty);
  assert.equal(contacts[0].role, "Programme Coordinator");
  assert.equal(contacts[0].person.id, "p-coord");
});

test("the contact does not depend on the order the faculty rows are returned in", () => {
  const configured = department([{ role: "Department In-Charge", facultySlug: "adarsh-vardhan-srivastava" }]);
  const forwards = departmentContacts(configured, faculty);
  const backwards = departmentContacts(configured, [...faculty].reverse());
  assert.equal(forwards[0].person.slug, backwards[0].person.slug);
  assert.equal(forwards[0].person.name, "Mr. Adarsh Vardhan Srivastava");
});

test("the first faculty row is never presented as the contact when it is not configured", () => {
  const contacts = departmentContacts(department([{ role: "Coordinator", facultySlug: "coordinator-person" }]), faculty);
  assert.equal(contacts.length, 1);
  assert.notEqual(contacts[0].person.slug, "first-row");
  assert.ok(!contacts.some((contact) => contact.person.name === "Dr. Chandrajeet Yadav"));
});

test("the displayed name, designation, email and phone belong to the configured person", () => {
  const contacts = departmentContacts(department([{ role: "Coordinator", facultySlug: "coordinator-person" }]), [
    person({ id: "p-first", slug: "first-row", name: "Dr. Chandrajeet Yadav", email: "first@example.test", phone: "1111111111" }),
    person({ id: "p-coord", slug: "coordinator-person", name: "Dr. Akanksha Coordinator", email: "coordinator@example.test", phone: "2222222222" }),
  ]);
  assert.deepEqual(
    { name: contacts[0].person.name, email: contacts[0].person.email, phone: contacts[0].person.phone, designation: contacts[0].person.designation },
    { name: "Dr. Akanksha Coordinator", email: "coordinator@example.test", phone: "2222222222", designation: "Assistant Professor" },
  );
});

test("no configured department contact yields no contact at all (fallback, never the first faculty row)", () => {
  assert.deepEqual(departmentContacts(department([]), faculty), []);
  assert.deepEqual(departmentContacts(department(undefined), faculty), []);
  assert.deepEqual(departmentContacts(undefined, faculty), []);
});

test("a configured person who is unpublished or no longer in the department is skipped, not substituted", () => {
  const contacts = departmentContacts(department([{ role: "Coordinator", facultySlug: "coordinator-person" }]), [
    person({ id: "p-coord", slug: "coordinator-person", status: "DRAFT" }),
    person({ id: "p-first", slug: "first-row", name: "Dr. Chandrajeet Yadav" }),
  ]);
  assert.deepEqual(contacts, []);
});

test("multiple configured responsibilities each keep their own person and details", () => {
  const contacts = departmentContacts(
    department([
      { role: "Coordinator", facultySlug: "coordinator-person", order: 0 },
      { role: "Department In-Charge", facultySlug: "adarsh-vardhan-srivastava", order: 1 },
      { role: "Head of Department", facultySlug: "hod-person", order: 2 },
    ]),
    faculty,
  );
  assert.deepEqual(contacts.map((contact) => `${contact.role}:${contact.person.slug}`), [
    "Coordinator:coordinator-person",
    "Department In-Charge:adarsh-vardhan-srivastava",
    "Head of Department:hod-person",
  ]);
});

test("the same person is never repeated with duplicated contact details", () => {
  const contacts = departmentContacts(
    department([
      { role: "Coordinator", facultySlug: "coordinator-person", order: 0 },
      { role: "Programme Coordinator", facultySlug: "coordinator-person", order: 1 },
    ]),
    faculty,
  );
  assert.equal(contacts.length, 1);
});

test("the curated seed configures a contact for every department and only from its own faculty", () => {
  for (const seeded of seedData.departments) {
    assert.ok((seeded.contacts || []).length > 0, `${seeded.slug} has a configured contact`);
    for (const contact of seeded.contacts || []) {
      const holder = seedData.faculty.find((item) => item.slug === contact.facultySlug);
      assert.ok(holder, `${contact.facultySlug} exists`);
      assert.equal(holder?.departmentSlug, seeded.slug, `${contact.facultySlug} belongs to ${seeded.slug}`);
      // The public card renders the person's own record, not a copy.
      const rendered = departmentContacts(seeded, seedData.faculty);
      assert.ok(rendered.some((entry) => entry.person.slug === contact.facultySlug && entry.role === contact.role));
    }
  }
});

test("validateDepartmentContacts accepts a name-based payload and rejects raw identifiers/duplicates", () => {
  assert.deepEqual(validateDepartmentContacts([{ role: "Coordinator", facultySlug: "archana-awasthi" }]), [{ role: "Coordinator", facultySlug: "archana-awasthi", order: 0 }]);
  assert.deepEqual(validateDepartmentContacts([]), []);
  assert.deepEqual(validateDepartmentContacts(undefined), []);
  // Malformed identifiers (spaces, uppercase, empty, over-long) are rejected.
  for (const bad of ["Faculty Id 12", "UPPER-CASE", "", "  ", "a".repeat(200)]) {
    assert.throws(() => validateDepartmentContacts([{ role: "Coordinator", facultySlug: bad }]), /Select a faculty member by name/);
  }
  assert.throws(() => validateDepartmentContacts([{ role: "", facultySlug: "archana-awasthi" }]), /responsibility/);
  assert.throws(() => validateDepartmentContacts([{ role: "Coordinator", facultySlug: "a" }, { role: "In-Charge", facultySlug: "a" }]), /cannot hold two configured responsibilities/);
  assert.throws(() => validateDepartmentContacts([{ role: "Coordinator", facultySlug: "a" }, { role: "In-Charge", facultySlug: "b" }, { role: "Third", facultySlug: "c" }, { role: "Fourth", facultySlug: "d" }, { role: "Fifth", facultySlug: "e" }, { role: "Sixth", facultySlug: "f" }, { role: "Seventh", facultySlug: "g" }]), /at most/);
  assert.equal(MAX_DEPARTMENT_CONTACTS, 6);
});

test("department contact configuration is limited to the department a role owns", () => {
  const superAdmin = { role: "SUPER_ADMIN" as const };
  const ietAdmin = { role: "IET_ADMIN" as const };
  const departmentAdmin = { role: "DEPARTMENT_ADMIN" as const, departmentId: "dept-cse" };
  const editor = { role: "EDITOR" as const };

  assert.equal(canConfigureDepartmentContacts(superAdmin, "civil-engineering", undefined), true);
  assert.equal(canConfigureDepartmentContacts(ietAdmin, "civil-engineering", undefined), true);
  // Their own department only.
  assert.equal(canConfigureDepartmentContacts(departmentAdmin, "computer-science-engineering", "computer-science-engineering"), true);
  assert.equal(canConfigureDepartmentContacts(departmentAdmin, "civil-engineering", "computer-science-engineering"), false);
  assert.equal(canConfigureDepartmentContacts(departmentAdmin, "civil-engineering", undefined), false);
  // A department administrator without a department has no scope at all.
  assert.equal(canConfigureDepartmentContacts({ role: "DEPARTMENT_ADMIN", departmentId: null }, "computer-science-engineering", "computer-science-engineering"), false);
  // Editors are outside the department-configuration scope in the existing model.
  assert.equal(canConfigureDepartmentContacts(editor, "civil-engineering", undefined), false);
});

test("the public contact card markup contains the configured person's own details", () => {
  const rows = departmentContacts(department([{ role: "Department In-Charge", facultySlug: "adarsh-vardhan-srivastava" }]), faculty).map((contact) =>
    React.createElement(
      "div",
      { className: "aside-item", key: contact.id },
      React.createElement("strong", null, contact.role),
      React.createElement("span", null, contact.person.name),
      React.createElement("span", null, contact.person.designation),
      contact.person.email ? React.createElement("span", null, contact.person.email) : null,
      contact.person.phone ? React.createElement("span", null, contact.person.phone) : null,
    ),
  );
  const markup = renderToStaticMarkup(React.createElement("div", null, rows));
  assert.match(markup, /Department In-Charge/);
  assert.match(markup, /Mr\. Adarsh Vardhan Srivastava/);
  assert.match(markup, /Assistant Professor · Department In-Charge/);
  assert.doesNotMatch(markup, /Dr\. Chandrajeet Yadav/);
});
