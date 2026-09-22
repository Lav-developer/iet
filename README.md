# IET-DSMNRU Institutional Platform

A database-ready, administrator-managed public website and CMS for the **Institute of Engineering & Technology (IET), Dr. Shakuntala Misra National Rehabilitation University (DSMNRU), Lucknow**.

This is not a student ERP, notice-board replacement or generic college template. It separates IET-owned academic/institutional information from DSMNRU-owned university services.

## What is included

- Responsive public website with editorial institutional homepage.
- Structured department, programme, faculty, laboratory and research discovery.
- Global search over approved pages and structured entities.
- CMS for departments, programmes, people, laboratories, research, projects, publications, achievements, events, organisations, pages, links, contacts, media and documents.
- PostgreSQL / Prisma schema with normalized relationships and migration SQL.
- Admin authentication with signed, HTTP-only session cookies and bcrypt password hashes.
- Roles: `SUPER_ADMIN`, `IET_ADMIN`, `DEPARTMENT_ADMIN`, `EDITOR`.
- Draft / review / publish / archive workflow fields.
- Audit log with actor, action, entity, timestamp and state snapshots where practical.
- Image/PDF upload endpoint with MIME and file-size checks. Local uploads are for evaluation only; production should use the object-storage adapter described below.
- Accessibility preferences: larger/smaller text, high contrast, reduced motion and reset.
- Semantic routes, metadata, canonical-ready metadata base, Open Graph defaults, breadcrumbs, sitemap and robots rules.
- English-first localized page model ready for an institutionally reviewed Hindi locale.
- Documentation for database setup, deployment and institutional handover.

## Source and data quality

The supplied `IET26072026.pdf` was treated as the primary IET-specific source. Seed records are curated from that document. The public DSMNRU website was used only to understand university-wide ownership and links.

Important editorial rules built into the product:

- No invented rankings, placement percentages, collaborations, awards, student counts or research metrics.
- The PDF's seat matrix is represented as programme records; current eligibility, fees and application rules are handed back to the official DSMNRU admissions system.
- Projects, publications, achievements, events and student organisations that are not present in the source are stored as clearly marked draft placeholders and do not render publicly.
- Faculty and staff contact details should be confirmed by IET before official publication.
- Content is published by IET / DSMNRU administrators through the content management system; only published records appear on the public website.

See [`docs/CONTENT-VERIFICATION.md`](docs/CONTENT-VERIFICATION.md) for the source inventory and editorial handover checklist.

## Technology

- Next.js App Router + TypeScript
- React
- Custom CSS design system (no remote fonts, no external image dependency)
- PostgreSQL + Prisma ORM
- `jose` signed sessions + `bcryptjs` password hashing
- Zod request validation
- Object storage abstraction point for S3-compatible storage

## Local preview without PostgreSQL

The public review seed can be viewed without an external database:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. The file-backed content store is strictly a local development fallback and is never selected in production.

To exercise CMS editing locally, opt in explicitly with credentials that are kept outside source control:

```bash
export ALLOW_DEMO_AUTH=true
export DEMO_ADMIN_EMAIL='your-local-admin@example.test'
export DEMO_ADMIN_PASSWORD='use-a-local-password-of-at-least-12-characters'
npm run dev
```

For durable content and named institutional accounts, configure PostgreSQL, apply migrations, and use the user-administration screen. Do not use demo authentication in an institutional deployment.

## PostgreSQL setup

Prerequisites: Node 20+, PostgreSQL 15+ recommended, and an institution-owned object storage bucket for production media.

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Replace `DATABASE_URL` and `AUTH_SECRET` with institution-owned values. Do not commit `.env`.

3. Generate the Prisma client:

   ```bash
   npm run db:generate
   ```

4. Apply the checked-in migration:

   ```bash
   npx prisma migrate deploy
   ```

   For local development where you want Prisma to create a new migration from schema changes, use:

   ```bash
   npm run db:migrate -- --name describe-your-change
   ```

5. In a local development database only, seed the verified starter records with an explicitly supplied initial account:

   ```bash
   NODE_ENV=development ALLOW_LOCAL_SEED=true \
   SEED_ADMIN_EMAIL='local-admin@example.test' \
   SEED_ADMIN_PASSWORD='supply-a-local-password-of-at-least-12-characters' \
   npm run db:seed
   ```

   Do not run the seed script against production; create named institutional accounts through the user-administration workflow.

6. Run the application:

   ```bash
   npm run dev
   # or
   npm run build && npm run start
   ```

The production schema is at `prisma/schema.prisma` and the first migration is at `prisma/migrations/0001_init/migration.sql`.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required in production | PostgreSQL connection string. Production fails safely when it is absent. |
| `AUTH_SECRET` | Required in production | Long random secret of at least 32 characters for signed admin sessions. |
| `NEXT_PUBLIC_SITE_URL` | Required in production | HTTPS canonical URL used by metadata, sitemap and robots. |
| `STORAGE_ENDPOINT` | Required in production | Institution-owned S3-compatible object-storage endpoint. |
| `STORAGE_BUCKET` | Required in production | Private bucket for media and documents. |
| `STORAGE_ACCESS_KEY` | Required in production | Object-storage service account key. |
| `STORAGE_SECRET_KEY` | Required in production | Object-storage service account secret. |
| `STORAGE_PUBLIC_BASE_URL` | Optional | Use only if the institution intentionally exposes a public CDN; otherwise the application media route is used. |
| `STORAGE_REGION` | Optional | S3-compatible region; defaults to `auto`. |
| `STORAGE_FORCE_PATH_STYLE` | Optional | Set `true` for providers that require path-style S3 URLs. |
| `ALLOW_DEMO_AUTH` | Local development only | Must be `false` or unset in production. Requires explicit demo credentials. |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | Local development only | Explicit local preview credentials; never commit or use for handover. |
| `ALLOW_LOCAL_SEED` | Local development only | Must be `true` only for an intentional local seed run. |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` | Local development only | Initial local seed account; no defaults are built into the seed script. |
| `NEXT_PUBLIC_ANALYTICS_ID` | Optional | Analytics account owned by IET / DSMNRU. Leave empty until approved. |

No personal Gmail, personal API key, personal domain, Firebase project or developer-owned database is required.

## CMS workflow

1. Sign in at `/admin/login`.
2. Choose an entity from the administrator sidebar.
3. Create a record as `DRAFT`.
4. An editor or administrator can move it to `REVIEW` after checking source, alt text, links and relationships.
5. A permitted IET administrator publishes it.
6. The public site renders only `PUBLISHED` records.
7. Important create/update/delete actions appear in `/admin/audit`.

The local preview can opt into an explicitly configured file-backed store, but production uses PostgreSQL as the sole content, authentication and audit source. Department administrators are checked against both the existing record and the requested department on every mutation; normalized relationships are edited through allow-listed relationship fields and are checked against department scope.

## Roles

- **Super Admin**: full platform access.
- **IET Administrator**: institute-wide content, users, settings and publishing.
- **Department Administrator**: department-scoped academic content; should be assigned a department in the database.
- **Editor**: create/edit working records; publishing and destructive permissions can be restricted further during institutional configuration.

The `User`, `UserRole`, `AuditLog` and relationship fields in the schema are designed for institutional ownership rather than a shared student account.

## Uploads and storage

`POST /api/admin/media/upload` validates file type and size:

- Images: PNG, JPEG, WebP or GIF, maximum 10 MB.
- Documents: PDF, maximum 25 MB.

In local development, the storage abstraction may write to the ignored `.data/uploads` directory, which is served only through the metadata-aware application route. Production requires an institution-owned S3-compatible bucket and fails safely when it is not configured:

1. Keep only the object key and approved metadata in PostgreSQL.
2. The upload endpoint validates allow-listed MIME types, file size and magic bytes before writing.
3. The media route serves approved objects with `nosniff`, safe content types and attachment disposition for PDFs.
4. Add institution-approved malware scanning, image dimension/metadata processing and retention controls at the storage boundary before launch.
5. Use private buckets and short-lived signed URLs if the institution introduces restricted documents.
6. Keep alt text, captions, document titles and department ownership metadata mandatory in the CMS.

## University ownership boundaries

IET owns:

- Institute identity, departments and programmes.
- Faculty and staff profiles.
- Laboratories and infrastructure records.
- Research areas, projects and publications.
- Achievements, events, student organisations and IET resources.
- IET contact channels and public academic content.

DSMNRU continues to own and operate:

- University website and university-wide notices.
- Samarth / ERP and student services.
- Admissions infrastructure, current application windows and fees.
- Examinations and results.
- Other university-level services.

The public site uses clear external links rather than duplicating those systems.

## Accessibility and SEO

The UI provides:

- Skip-to-content link.
- Semantic headings, labelled controls, keyboard navigation and visible focus.
- Responsive layout and mobile navigation.
- High contrast, text-size and reduced-motion preferences.
- Empty, loading and error states.
- Source/provenance notices to prevent misleading content.
- Open Graph defaults, route metadata, semantic slugs, breadcrumbs, sitemap and robots rules.

Institutional QA should still test new records with keyboard-only use, NVDA/VoiceOver, mobile browsers and accessible PDF checks. A policy page is included as a review placeholder; replace it with approved DSMNRU / IET terms before launch.

## Search architecture

The server-side search route uses PostgreSQL full-text functions (`to_tsvector` / `websearch_to_tsquery`) over approved structured records in database mode, with a bounded deterministic index for the explicit local development fallback. Results are limited and rate-limited. A retrieval service or AI assistant is not required for the site to work and, if considered later, must cite only approved IET records.

An AI assistant is intentionally not required for the site to work. If added later, it must retrieve approved IET records and show source links; it must answer that information is not found rather than hallucinate.

## Deployment and handover

Recommended institutional deployment:

1. IET / DSMNRU owns the Git repository and branch protection.
2. IET / DSMNRU owns the domain and TLS certificate.
3. Deploy the Next.js app on institution-approved infrastructure or an institution-owned cloud account.
4. Provision PostgreSQL with encrypted connections, separate application and migration credentials, backups and point-in-time recovery if available.
5. Provision an S3-compatible bucket owned by the institution; do not use a student account.
6. Set secrets through the host's secret manager / environment settings.
7. Run `prisma migrate deploy`. Do not run the local-only seed script against production.
8. Create named administrator accounts through the approved bootstrap procedure and `/admin/users`; never share accounts.
9. Configure SMTP / institutional contact routing when approved.
10. Configure analytics only after privacy approval.
11. Verify `NEXT_PUBLIC_SITE_URL`, sitemap, robots, canonical metadata, redirects and external university links.
12. Run content, accessibility, security, backup-restore and mobile acceptance tests.

### Backup considerations

- Back up PostgreSQL on an automated schedule and test restoration.
- Version the schema migrations in source control.
- Version the seed script, not production content snapshots containing personal data.
- Back up object storage separately or enable versioning / replication.
- Keep audit logs under the institution's retention policy.
- Document who can rotate `AUTH_SECRET`, database credentials and storage keys.

## Useful routes

Public:

- `/`
- `/about`
- `/departments`
- `/departments/[slug]`
- `/programs`
- `/programs/[slug]`
- `/faculty`
- `/faculty/[slug]`
- `/laboratories`
- `/laboratories/[slug]`
- `/research`
- `/projects`
- `/publications`
- `/events`
- `/achievements`
- `/campus`
- `/organizations`
- `/career`
- `/infrastructure`
- `/resources`
- `/admissions`
- `/contact`
- `/search`
- `/accessibility`
- `/privacy`
- `/sitemap.xml`
- `/robots.txt`

Admin:

- `/admin/login`
- `/admin`
- `/admin/content/[entity]`
- `/admin/audit`
- `/admin/users`

## Before official launch

This implementation is a strong platform candidate, not an assertion of institutional endorsement. The designated IET / DSMNRU owner should approve:

- Name treatment: IET versus Faculty of Engineering & Technology.
- All faculty contact details and department coordinators.
- Postal address, phone routing and official email channels.
- Current programme names, seats, eligibility and fees.
- Laboratory descriptions, equipment, images and access rules.
- Research areas, projects, publications, achievements, events and student organisations.
- Hindi translations, privacy terms, analytics and accessibility contact.
- Hosting, repository, database, storage, backups and administrator list.
