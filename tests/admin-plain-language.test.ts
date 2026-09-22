import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * The administrators are non-technical university staff. The workspace must
 * speak plain language: no database identifiers, storage keys, MIME types,
 * raw URLs or Prisma vocabulary in labels, and no prototype / handover /
 * demo wording anywhere staff or the public can see it.
 */
const editor = readFileSync("components/entity-manager.tsx", "utf8");
const labels = [...editor.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);

test("field labels are plain language: no slugs, ids, storage keys, MIME types or Prisma terms", () => {
  assert.ok(labels.length > 60, "the field configuration is present");
  for (const label of labels) {
    assert.doesNotMatch(label, /\bslug\b|\bID\b|\bid\b|storage key|MIME|mime|createdBy|updatedBy|prisma|object key|metadata/i, `label "${label}" leaks an internal term`);
  }
  // The previous jargon labels are gone…
  for (const gone of ["Department slug", "Storage key", "MIME type", "Size (bytes)", "Public URL", "Workflow status", "Laboratory slugs", "Author faculty slugs", "Setting key", "Alt text / accessible title"]) {
    assert.ok(!labels.includes(gone), `label "${gone}" is no longer used`);
  }
  // …and replaced by wording staff understand.
  for (const expected of ["Department", "Department (optional)", "Web address", "Notice PDF", "Notice type", "Notice title", "Document title", "Description for screen readers (alternative text)", "Linked laboratories", "IET authors"]) {
    assert.ok(labels.includes(expected), `label "${expected}" is offered`);
  }
  // Internal file fields of uploads are not editable form fields any more.
  for (const entity of ["media", "documents"]) {
    const start = editor.indexOf(`${entity}: { title:`);
    const block = editor.slice(start, editor.indexOf("] },", start));
    assert.doesNotMatch(block, /key: "key", label|key: "url", label|key: "mimeType", label|key: "sizeBytes", label/, `${entity} exposes no storage fields`);
  }
});

test("the record list never shows database ids or storage keys as a record's identity", () => {
  assert.doesNotMatch(editor, /record\.slug \|\| record\.key \|\| record\.id/);
  assert.doesNotMatch(editor, /\{String\(record\.id\)\}<\/span>/);
  assert.match(editor, /const subtitle = \(record: EntityRecord\) =>/);
  assert.match(editor, /function fileName\(record: EntityRecord\)/, "uploads are described by file name and size, not by object key");
  assert.doesNotMatch(editor, /"seed"/, "no 'seed' placeholder in the Updated column");
  // Status values are shown as words, and select options carry readable labels.
  assert.match(editor, /statusLabels\[String\(record\.status\)\]/);
  assert.match(editor, /optionLabels: \{ TEXT: "Text notice \(read on the website\)", PDF: "PDF notice \(opens an uploaded PDF\)" \}/);
});

test("uploads are explained in plain terms and drafts are the default for roles without publishing authority", () => {
  assert.match(editor, /<h3>\{isDocument \? "Upload a PDF" : "Upload an image"\}<\/h3>/);
  assert.doesNotMatch(editor, /Demo stores locally|object storage|Upload and create metadata/);
  assert.match(editor, /Publish this PDF on the public website immediately/);
  assert.match(editor, /form\.append\("status", isDocument && publish && canPublish \? "PUBLISHED" : "DRAFT"\)/);
  assert.match(editor, /Uploaded PDFs are saved as drafts\. A PDF attached to a notice is published together with the notice/);
  // Empty states and confirmations.
  assert.match(editor, /No \{config\.title\.toLowerCase\(\)\} yet/);
  assert.match(editor, /Use “New \$\{config\.singular\}” to add the first one\./);
  assert.match(editor, /window\.confirm\(isDocument \? "Publish this PDF on the public website as soon as it is uploaded\?"/);
});

test("no prototype, handover or demo wording remains in staff-facing or public-facing copy", () => {
  const files = [
    "components/admin-shell.tsx", "components/entity-manager.tsx", "app/admin/(app)/page.tsx", "app/(auth)/admin/login/page.tsx", "app/api/admin/summary/route.ts",
    "app/(public)/page.tsx", "components/public-shell.tsx", "components/notice-board.tsx", "app/(public)/admissions/page.tsx", "app/(public)/admissions/fee-structure/page.tsx",
  ];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /prototype|handover|built by|developed by|demo account|Demo fallback|Content Studio|review-ready|approval required|pending approval|Lav\b/i, `${file} carries no prototype wording`);
  }
  // The seed's content-status setting no longer describes a prototype.
  assert.doesNotMatch(readFileSync("data/seed.ts", "utf8"), /Review-ready prototype|approval required before production/);
  // Legitimate notes stay: the fee source note and the accessibility statement.
  assert.match(readFileSync("lib/fee-structure.ts", "utf8"), /Students should refer to the latest university notice/);
  assert.match(readFileSync("components/public-shell.tsx", "utf8"), /Accessibility statement/);
});
