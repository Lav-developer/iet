import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

function walk(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}

test("public routes and navigation cannot reintroduce admin links or editorial UI", () => {
  const files = [...walk("app/(public)").filter((file) => file.endsWith(".tsx")), "app/not-found.tsx", "components/public-shell.tsx", "components/accessibility.tsx", "components/faculty-directory.tsx", "components/laboratory-directory.tsx", "components/program-explorer.tsx", "components/search-explorer.tsx"];
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /href=["'`]\/admin|Edit in CMS|CMS sign in|<SourceNote|<VerificationBadge|queryable entities|review-ready|source marker|record status|before official public launch/i, file);
  }
  assert.match(readFileSync("app/(auth)/admin/login/page.tsx", "utf8"), /api\/auth\/login/);
});

test("new migration is additive and preserves faculty when assets are deleted", () => {
  const sql = readFileSync("prisma/migrations/0005_faculty_profile_assets/migration.sql", "utf8");
  assert.doesNotMatch(sql, /\bDROP\b|\bTRUNCATE\b|\bDELETE FROM\b|NOT NULL/);
  for (const field of ["profileImageId", "cvUrl", "cvDocumentId"]) assert.match(sql, new RegExp(`ADD COLUMN "${field}" TEXT`));
  assert.equal(sql.match(/ON DELETE SET NULL/g)?.length, 2);
});
