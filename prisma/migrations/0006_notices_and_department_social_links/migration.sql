-- Additive migration (PR #3 follow-up):
--   1. Department-owned official social/external links (structured URLs).
--   2. Institutional notice board (text notices and PDF notices).
-- Every column on existing tables is unchanged; the two new tables are empty
-- after this migration, so existing department, document and faculty records
-- are untouched.

-- CreateTable
CREATE TABLE "DepartmentSocialLink" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DepartmentSocialLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notice" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT,
    "noticeType" TEXT NOT NULL DEFAULT 'TEXT',
    "documentId" TEXT,
    "noticeDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "category" TEXT,
    "departmentId" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notice_slug_key" ON "Notice"("slug");
CREATE INDEX "Notice_status_idx" ON "Notice"("status");
CREATE INDEX "Notice_noticeDate_idx" ON "Notice"("noticeDate");
CREATE INDEX "Notice_expiryDate_idx" ON "Notice"("expiryDate");
CREATE INDEX "Notice_noticeType_idx" ON "Notice"("noticeType");
CREATE INDEX "Notice_departmentId_idx" ON "Notice"("departmentId");
CREATE INDEX "Notice_documentId_idx" ON "Notice"("documentId");
CREATE INDEX "DepartmentSocialLink_departmentId_idx" ON "DepartmentSocialLink"("departmentId");
CREATE INDEX "DepartmentSocialLink_platform_idx" ON "DepartmentSocialLink"("platform");

-- AddForeignKey
ALTER TABLE "DepartmentSocialLink" ADD CONSTRAINT "DepartmentSocialLink_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notice" ADD CONSTRAINT "Notice_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
