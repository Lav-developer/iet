-- Additive migration (PR #3 follow-up): explicit department contact
-- configuration.
--
-- Why this is required: the only department-responsibility data in the schema
-- was a free-text `FacultyMember.designation` string. A department's public
-- contact could therefore only be guessed (by matching text, or worse by
-- taking the first faculty row returned), which is exactly the defect being
-- fixed. A department now records, explicitly, which faculty member holds
-- which responsibility.
--
-- Every existing column is unchanged and no record is removed. The new table
-- is backfilled from the designations already published in the database, so
-- departments that currently publish a Coordinator / Department In-Charge /
-- Head of Department keep exactly that contact and can adjust it in the CMS.
--
-- If no responsibility is recorded, the public card shows a "contact not
-- available" fallback: the first faculty row is never presented as the
-- department's contact.

-- CreateTable
CREATE TABLE "DepartmentContact" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DepartmentContact_departmentId_facultyId_key" ON "DepartmentContact"("departmentId", "facultyId");

-- CreateIndex
CREATE INDEX "DepartmentContact_departmentId_idx" ON "DepartmentContact"("departmentId");

-- CreateIndex
CREATE INDEX "DepartmentContact_facultyId_idx" ON "DepartmentContact"("facultyId");

-- AddForeignKey
ALTER TABLE "DepartmentContact" ADD CONSTRAINT "DepartmentContact_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DepartmentContact" ADD CONSTRAINT "DepartmentContact_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "FacultyMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: convert the responsibilities that are already published in
-- `designation` into explicit configuration. Only the first matching
-- responsibility per person is imported, and the unique (department, faculty)
-- key makes this idempotent for databases seeded after this migration ran.
INSERT INTO "DepartmentContact" ("id", "departmentId", "facultyId", "role", "order", "createdAt", "updatedAt")
SELECT
    'deptcontact-' || f."id",
    f."departmentId",
    f."id",
    CASE
        WHEN f."designation" ~* 'coordinator' THEN 'Coordinator'
        WHEN f."designation" ~* 'in[ -]?charge' THEN 'Department In-Charge'
        WHEN f."designation" ~* '(^|[^a-z])hod([^a-z]|$)' OR f."designation" ~* 'head of department' THEN 'Head of Department'
        ELSE 'Department Contact'
    END,
    CASE
        WHEN f."designation" ~* 'coordinator' THEN 0
        WHEN f."designation" ~* 'in[ -]?charge' THEN 1
        WHEN f."designation" ~* '(^|[^a-z])hod([^a-z]|$)' OR f."designation" ~* 'head of department' THEN 2
        ELSE 3
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "FacultyMember" f
WHERE f."departmentId" IS NOT NULL
  AND f."status" = 'PUBLISHED'
  AND (
      f."designation" ~* 'coordinator'
      OR f."designation" ~* 'in[ -]?charge'
      OR f."designation" ~* '(^|[^a-z])hod([^a-z]|$)'
      OR f."designation" ~* 'head of department'
  )
ON CONFLICT ("departmentId", "facultyId") DO NOTHING;
