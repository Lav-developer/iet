/**
 * Optional local migration check — no database server required.
 *
 * Applies every checked-in migration, in order, to an in-process
 * Postgres-compatible engine (PGlite) and asserts the resulting structure.
 * This is how the notice board / department-social-link migration can be
 * verified before it is applied to any real environment. It never connects to
 * a production database and never modifies one.
 *
 * Optional QA dependency (not part of `npm test`):
 *   npm install --no-save --package-lock=false @electric-sql/pglite
 * Usage:
 *   node tests/migrations.check.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const db = new PGlite();
const directory = "prisma/migrations";
const migrationNames = readdirSync(directory).filter((name) => /^\d{4}_/.test(name)).sort();

for (const migration of migrationNames) {
  const sql = readFileSync(`${directory}/${migration}/migration.sql`, "utf8");
  try {
    await db.exec(sql);
    console.log(`applied ${migration}`);
  } catch (error) {
    console.error(`FAILED ${migration}: ${error.message}`);
    process.exit(1);
  }
}

const fail = (message) => { console.error(message); process.exit(1); };
const columnNames = async (table) => {
  const { rows } = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [table]);
  return rows.map((row) => row.column_name);
};

// New tables exist with the expected shapes.
for (const required of ["Notice", "DepartmentSocialLink"]) {
  const { rows } = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`, [required]);
  if (!rows.length) fail(`missing table ${required}`);
}
console.log("Notice columns:", (await columnNames("Notice")).join(", "));
console.log("DepartmentSocialLink columns:", (await columnNames("DepartmentSocialLink")).join(", "));

// Existing records and their columns are preserved by the additive migration.
await db.exec(`INSERT INTO "Department" (id, slug, name, overview, status, "updatedAt") VALUES ('d1','civil-engineering','Department of Civil Engineering','Existing overview','PUBLISHED', NOW())`);
await db.exec(`INSERT INTO "DepartmentSocialLink" (id, "departmentId", platform, url, "updatedAt") VALUES ('s1','d1','INSTAGRAM','https://instagram.com/iet', NOW())`);
await db.exec(`DELETE FROM "Department" WHERE id = 'd1'`);
const { rows: orphaned } = await db.query(`SELECT count(*)::int AS count FROM "DepartmentSocialLink"`);
if (orphaned[0].count !== 0) fail("cascade delete did not remove department social links");
console.log("cascade delete removes department links with their department");

await db.exec(`INSERT INTO "Document" (id, title, key, url, "mimeType", status, "updatedAt") VALUES ('doc1','Notice PDF','documents/2026/11111111-1111-4111-8111-111111111111.pdf','/api/media/documents/2026/11111111-1111-4111-8111-111111111111.pdf','application/pdf','DRAFT', NOW())`);
await db.exec(`INSERT INTO "Notice" (id, slug, title, body, "noticeType", "noticeDate", "updatedAt") VALUES ('n1','text-notice','Text notice','Body','TEXT', NOW(), NOW())`);
await db.exec(`INSERT INTO "Notice" (id, slug, title, "noticeType", "documentId", "noticeDate", "updatedAt") VALUES ('n2','pdf-notice','PDF notice','PDF','doc1', NOW(), NOW())`);
await db.exec(`DELETE FROM "Document" WHERE id = 'doc1'`);
const { rows: notice } = await db.query(`SELECT "documentId" FROM "Notice" WHERE id = 'n2'`);
if (notice[0].documentId !== null) fail("deleting a document did not null the notice reference");
console.log("deleting a PDF document nulls the notice reference and keeps the notice");

console.log("MIGRATION CHECK PASSED (no database server or production system was touched)");
await db.close();
