export type ContentStatus = "DRAFT" | "REVIEW" | "PUBLISHED" | "ARCHIVED";

export type Department = {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  overview: string;
  established?: string;
  sourceNote?: string;
  status: ContentStatus;
};

export type Program = {
  id: string;
  slug: string;
  title: string;
  shortTitle?: string;
  level: "UG" | "PG" | "Certificate" | string;
  duration: string;
  approvedSeats?: number;
  summary: string;
  eligibility?: string;
  admissionNote?: string;
  sourceNote?: string;
  departmentSlug?: string;
  departmentName?: string;
  laboratorySlugs?: string[];
  status: ContentStatus;
};

export type FacultyMember = {
  id: string;
  slug: string;
  name: string;
  designation: string;
  profileImageId?: string | null;
  profileImage?: { url: string; altText: string };
  cvUrl?: string | null;
  cvDocumentId?: string | null;
  cv?: { url: string; external: boolean };
  email?: string;
  phone?: string;
  qualification?: string;
  profile?: string;
  researchInterests?: string[];
  departmentSlug?: string;
  departmentName?: string;
  researchAreaSlugs?: string[];
  laboratorySlugs?: string[];
  type?: string;
  status: ContentStatus;
};

export type Laboratory = {
  id: string;
  slug: string;
  name: string;
  description: string;
  equipment?: string;
  courses?: string;
  researchRelevance?: string;
  departmentSlug?: string;
  departmentName?: string;
  status: ContentStatus;
};

export type ResearchArea = {
  id: string;
  slug: string;
  name: string;
  description: string;
  sourceNote?: string;
  facultySlugs?: string[];
  departmentSlugs?: string[];
  status: ContentStatus;
};

export type Project = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  sponsor?: string;
  status: ContentStatus;
  departmentSlug?: string;
  departmentName?: string;
  facultySlugs?: string[];
  laboratorySlugs?: string[];
};

export type Publication = {
  id: string;
  slug: string;
  title: string;
  venue?: string;
  year?: number;
  doi?: string;
  url?: string;
  abstract?: string;
  departmentSlug?: string;
  departmentName?: string;
  authorSlugs?: string[];
  status: ContentStatus;
};

export type Achievement = {
  id: string;
  title: string;
  category: string;
  description: string;
  recipient?: string;
  year?: number;
  eventName?: string;
  departmentSlug?: string;
  departmentName?: string;
  status: ContentStatus;
};

export type EventItem = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  // ISO string in the file-backed development store, Date from PostgreSQL.
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  location?: string;
  registrationUrl?: string;
  organizationId?: string | null;
  departmentSlug?: string;
  departmentName?: string;
  status: ContentStatus;
};

export type StudentOrganization = {
  id: string;
  slug: string;
  name: string;
  description: string;
  contactUrl?: string;
  departmentSlug?: string;
  status: ContentStatus;
};

export type PageRecord = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string;
  body: string;
  locale: string;
  status: ContentStatus;
};

export type LinkRecord = {
  id: string;
  label: string;
  url: string;
  description?: string;
  owner: "DSMNRU" | "IET" | string;
  order: number;
  status: ContentStatus;
};

export type ContactRecord = {
  id: string;
  label: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  category: string;
  status: ContentStatus;
};

export type MediaRecord = {
  id: string;
  key: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
  altText?: string;
  caption?: string;
};

export type DocumentRecord = {
  id: string;
  title: string;
  description?: string;
  key: string;
  url: string;
  mimeType: string;
  sizeBytes?: number;
  altText?: string;
  status: ContentStatus;
  departmentId?: string;
  pageId?: string;
};

export type SiteSetting = {
  id: string;
  key: string;
  value: string;
  description?: string;
};

export type AuditEntry = {
  id: string;
  user: string;
  userId?: string;
  role?: string;
  ipAddress?: string;
  action: string;
  entity: string;
  entityId?: string;
  timestamp: string;
  before?: unknown;
  after?: unknown;
};

export type EntityName =
  | "departments"
  | "programs"
  | "faculty"
  | "laboratories"
  | "researchAreas"
  | "projects"
  | "publications"
  | "achievements"
  | "events"
  | "organizations"
  | "pages"
  | "links"
  | "contacts"
  | "settings"
  | "media"
  | "documents";

export type SiteData = {
  departments: Department[];
  programs: Program[];
  faculty: FacultyMember[];
  laboratories: Laboratory[];
  researchAreas: ResearchArea[];
  projects: Project[];
  publications: Publication[];
  achievements: Achievement[];
  events: EventItem[];
  organizations: StudentOrganization[];
  pages: PageRecord[];
  links: LinkRecord[];
  contacts: ContactRecord[];
  settings: SiteSetting[];
  media: MediaRecord[];
  documents: DocumentRecord[];
};
