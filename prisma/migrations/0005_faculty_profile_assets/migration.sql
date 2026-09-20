-- Optional profile assets; all existing faculty records retain NULL values.
ALTER TABLE "FacultyMember"
  ADD COLUMN "profileImageId" TEXT,
  ADD COLUMN "cvUrl" TEXT,
  ADD COLUMN "cvDocumentId" TEXT;

CREATE INDEX "FacultyMember_profileImageId_idx" ON "FacultyMember"("profileImageId");
CREATE INDEX "FacultyMember_cvDocumentId_idx" ON "FacultyMember"("cvDocumentId");

ALTER TABLE "FacultyMember" ADD CONSTRAINT "FacultyMember_profileImageId_fkey"
  FOREIGN KEY ("profileImageId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FacultyMember" ADD CONSTRAINT "FacultyMember_cvDocumentId_fkey"
  FOREIGN KEY ("cvDocumentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
