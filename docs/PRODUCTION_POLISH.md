# Production polish release notes

## Scope and data safety

This change is based on `main` at `79cc410` and uses the session branch
`arena/01a0bf46-iet`. It preserves the existing visual design and production
content. No production database, environment variables, storage objects or
SUPER_ADMIN account were accessed or modified during implementation.

- Department contact selection prefers a published teaching faculty member
  whose designation contains `(Coordinator)`, case-insensitively. Multiple
  coordinators use name, then slug/id as a deterministic tie-breaker; otherwise
  the first published teaching faculty member is used. Directory ordering is
  unchanged. Contact labels, email and telephone links reflect the selection.
- All public route templates were audited for internal/CMS copy and admin links.
  Admin routes and authentication remain intact at `/admin/login`.
- Faculty photos and CVs reuse the existing Media, Document, upload and delivery
  infrastructure. Images use accessible alt text; missing images use initials.
- Organization cards link to `/organizations/[slug]`. Detail pages include
  description, department, a safe external contact link, and associated published
  events. Missing/non-published organizations return 404. The existing Event
  organization relationship can now be selected in the event editor.
- Fixed department anchors, the staff-directory query filter, missing project
  rendering, publication source links, research counts, undated event grouping,
  resource document links, search destinations and organization discovery.
  Published English CMS pages without bespoke templates now have a plain-text
  public route, avoiding dead search/sitemap links.
- Public data excludes internal source notes, raw nested Prisma relations and
  settings. Existing editorial fields and admin content are not rewritten.
- `lib/public-copy.ts` replaces only exact known legacy bootstrap boilerplate
  at presentation time. It does not write to the database or use broad text
  filters, and leaves newly authored content unchanged. It retains meaningful
  institutional details while removing seed/developer explanations. A missing
  privacy policy is described honestly; legal terms were not invented.

## Migration 0005: faculty profile assets

`prisma/migrations/0005_faculty_profile_assets/migration.sql` adds:

| FacultyMember field | Purpose |
| --- | --- |
| `profileImageId` | Optional FK to existing `Media`, indexed |
| `cvUrl` | Optional external HTTPS CV URL |
| `cvDocumentId` | Optional FK to existing `Document`, indexed |

Both foreign keys use `ON DELETE SET NULL`. Existing records retain null values;
no backfill, reseed, user update or destructive change is involved. No image or
PDF binary data is stored in PostgreSQL. The existing Event.organizationId needs
no migration.

### Release commands — operator action, not run against production by this PR

Before the new application serves production traffic, use the approved release
environment with the **existing** production `DATABASE_URL` and the merged code:

```sh
npm ci
npx prisma generate
npx prisma migrate deploy
```

Then deploy/promote through the existing Vercel workflow (`npm run build` remains
the build command). If merging automatically deploys to production, coordinate
that deployment so migration 0005 completes **before** promoting the new build;
the new Prisma model requires these columns at runtime. Do not add or change
production environment variables. Do not run reset, db push, seed, or bootstrap.

Afterward:
1. Open `/admin/login` directly and edit a faculty member.
2. Select an existing photo or upload one with alt text. Save the faculty record.
3. Enter an HTTPS CV URL, or select/upload a PDF. New PDFs are DRAFT and must go
   through the existing Documents review/publication workflow before appearing
   publicly. If both are supplied, the external HTTPS URL takes precedence.
4. Check the directory and profile. Check a profile without assets still works.
5. Check a department coordinator and a published organization detail page.

No actual faculty photographs or CVs were supplied in this task, so none were
invented or attached automatically.

## Verification performed

- `npm run lint`: passed (TypeScript check).
- `npm test`: **85 passed**, including existing security/auth/workflow tests and
  new coordinator, organization rendering/404, photo/CV, URL validation,
  reference-scope, public-copy/UI and additive-migration guards.
- `npm run build`: passed, including all public and admin routes.
- Prisma schema validation: passed. Native Prisma binary downloads were blocked
  by sandbox network access; engine-free client generation was used locally for
  type checking/build only. No engine setting or dependency change is committed.
- Isolated PGlite (PostgreSQL-compatible WASM) migration exercise: applied
  migrations 0001–0005, preserved an existing faculty row, verified nullable
  fields, both `SET NULL` foreign keys, and rejection of nonexistent asset IDs.
  This is not a production migration or a production connection test.
- Chromium/Playwright mobile crawl at 390px: **77 public URLs**, with zero broken
  internal links/anchors, admin links, missing image alt attributes, horizontal
  overflow, missing/multiple H1s or browser errors detected. Checked six invalid
  detail/page routes for HTTP 404 and direct `/admin/login` availability. Reviewed
  homepage screenshots at 390px and 1440px.
- Local-only admin browser exercise: demo login; inline image and PDF upload;
  invalid HTTP CV validation; save/reopen asset relations; DRAFT CV hidden and
  delivery 404; published PDF download 200; clear both assets; search submission;
  accessibility panel Escape/focus behavior. Local fixtures and temporary
  credentials were removed afterward.
- `git diff --check`: passed. Changed files reviewed.

## Remaining limitations / editorial follow-up

- Live Vercel, production PostgreSQL and Backblaze credentials were intentionally
  not used. Verify those integrations after the controlled deployment.
- External university destinations may change and could not be reliably probed
  from this sandbox. Existing official URLs are retained; unsafe schemes and
  credential-bearing URLs are rejected/omitted.
- The institution still needs to supply its approved privacy policy and actual
  photographs/CVs. Authored CMS prose outside the exact legacy-copy map remains
  institution-controlled and may need editorial review.
- Existing role boundaries are preserved: department administrators cannot upload
  to the shared Media library; a SUPER_ADMIN/IET_ADMIN (or authorized editor)
  handles new photographs. Scoped document selection/upload remains supported.
  Referencing a published document does not grant permission to edit it, and
  attaching a draft PDF never makes it public.
- The browser audit is not a formal screen-reader/WCAG certification. Organization
  populated/empty/draft states are additionally covered by rendered-component
  fixtures; no production organizations were changed for testing.

## Changed files

```text
app/(public)/[slug]/page.tsx
app/(public)/about/page.tsx
app/(public)/accessibility/page.tsx
app/(public)/achievements/page.tsx
app/(public)/admissions/page.tsx
app/(public)/campus/page.tsx
app/(public)/career/page.tsx
app/(public)/contact/page.tsx
app/(public)/departments/[slug]/page.tsx
app/(public)/departments/page.tsx
app/(public)/events/page.tsx
app/(public)/faculty/[slug]/page.tsx
app/(public)/faculty/page.tsx
app/(public)/infrastructure/page.tsx
app/(public)/laboratories/[slug]/page.tsx
app/(public)/laboratories/page.tsx
app/(public)/organizations/[slug]/page.tsx
app/(public)/organizations/page.tsx
app/(public)/page.tsx
app/(public)/people/page.tsx
app/(public)/privacy/page.tsx
app/(public)/programs/[slug]/page.tsx
app/(public)/programs/page.tsx
app/(public)/projects/page.tsx
app/(public)/publications/page.tsx
app/(public)/research/page.tsx
app/(public)/resources/page.tsx
app/(public)/search/page.tsx
app/(public)/sitemap.xml/route.ts
app/api/admin/content/route.ts
app/globals.css
app/layout.tsx
app/not-found.tsx
components/accessibility.tsx
components/content-cards.tsx
components/entity-manager.tsx
components/faculty-directory.tsx
components/laboratory-directory.tsx
components/program-explorer.tsx
components/public-shell.tsx
components/search-explorer.tsx
components/ui.tsx
docs/PRODUCTION_POLISH.md
lib/content-policy.ts
lib/faculty-relations.ts
lib/public-content.ts
lib/public-copy.ts
lib/store.ts
lib/types.ts
prisma/migrations/0005_faculty_profile_assets/migration.sql
prisma/schema.prisma
tests/public-polish.test.ts
tests/public-ui-guards.test.ts
```
