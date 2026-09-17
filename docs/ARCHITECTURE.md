# Architecture overview

## Runtime

```text
Browser
  ├─ public Next.js server-rendered routes
  ├─ client filters / accessibility preferences
  └─ administrator CMS
       ├─ HTTP-only, same-site signed session cookie
       ├─ database-backed session-version invalidation
       ├─ same-origin checks on state changes
       ├─ Zod/allow-list validation
       ├─ PostgreSQL shared rate-limit buckets
       └─ audit event with authenticated actor attribution

Next.js server
  ├─ typed content store
  │    ├─ Prisma/PostgreSQL in production
  │    └─ explicit local development fallback only
  ├─ PostgreSQL full-text search in database mode
  ├─ local storage adapter only in development
  ├─ S3-compatible object-storage adapter in production
  └─ sitemap / robots / metadata / security headers

PostgreSQL
  ├─ normalized entity tables and relationship join tables
  ├─ users, roles, department assignments and session versions
  ├─ workflow status and editorial creator/updater IDs
  ├─ audit logs with user, role, IP and before/after snapshots
  └─ media/document metadata and shared rate-limit state

Object storage (production)
  └─ institution-owned images and PDFs; PostgreSQL stores keys and editorial metadata
```

## Content model

Relationships are normalized rather than hidden in one JSON field:

- Department → Program, FacultyMember, Laboratory, Project, Publication and other scoped content
- FacultyMember ↔ ResearchArea, Project, Publication and Laboratory
- Project ↔ Laboratory
- Program ↔ Laboratory
- ResearchArea ↔ Department
- Page / Document / Media / Link / Contact / SiteSetting

Publicly publishable entities carry workflow state plus timestamps. Editorial entities also carry `createdById` and `updatedById`; the audit log remains the authoritative immutable mutation trail. Publications have department ownership so department authorization is not inferred from an author alone.

## Public rendering model

- Public server components read through `getSiteData()` with published-only filtering.
- Protected CMS reads call `getEntity(..., true)` after authentication.
- Empty states identify records awaiting official publication rather than inventing content.
- Dynamic department, programme, faculty and laboratory routes are generated from structured records.
- Media/document downloads resolve the database record first; unpublished documents are not exposed.

## CMS and workflow

The generic `EntityManager` provides a consistent editor while each entity maps to a separate Prisma model. Relationship fields accept normalized slugs and synchronize join tables. The API allow-lists fields, validates URLs/dates/lengths, checks workflow transitions and records actor attribution.

Workflow transitions are deliberately conservative:

- new records start as `DRAFT`;
- `DRAFT → REVIEW` is available to working editors;
- `REVIEW → PUBLISHED` and `PUBLISHED → ARCHIVED` require IET/Super administration;
- published/archived records cannot be changed by editors or department administrators;
- department administrators are checked against the current record, requested department and scoped relationship IDs.

User administration is separate from content editing. Password/role/department/active changes increment `sessionVersion`, invalidating previously issued tokens.

## Search model

Database mode uses PostgreSQL `to_tsvector` with `websearch_to_tsquery` over approved structured entities. The public result contract is shared with a deterministic local fallback index. Query length, result count and request rate are bounded. A future semantic assistant must retrieve only approved IET records and show source links; it is not required for the institutional website.

## Localization and source governance

Pages have a locale field and the schema is ready for reviewed English/Hindi records. Hindi publication is an editorial process, not an unreviewed machine translation. The source PDF is the primary IET factual source; university service links remain links to DSMNRU-owned systems.

## Security posture

- Production configuration requires PostgreSQL, a strong environment-provided `AUTH_SECRET`, HTTPS site URL and complete institution-owned object-storage settings. It fails before serving when required configuration is missing.
- Passwords are bcrypt-hashed; sessions are signed with a secret and rechecked against the active database user/session version.
- State-changing routes require a same-origin request in production and use shared PostgreSQL rate limits.
- Uploads use an object-storage abstraction, allow-listed MIME types, size limits and magic-byte checks; files are not served by user-controlled paths.
- Next security headers include CSP, HSTS in production, `nosniff`, frame protection, referrer policy and permissions policy.
- Production responses use generic errors; detailed diagnostics remain server logs.
- Audit events include authenticated user ID, role, action, entity, IP when available, and state snapshots.

Institutional operations must still add/approve MFA or SSO, malware scanning, centralized redacted logging, dependency monitoring and an incident-response process where required by policy. See `docs/DEPLOYMENT.md`.
