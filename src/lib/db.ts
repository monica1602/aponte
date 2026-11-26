import crypto from "node:crypto";
import { getDriver, setIdTables, type Param, type Row, type RunResult } from "./sql";

export type Role = "mentor" | "mentee" | "company";
export type AccountStatus = "pending" | "active" | "rejected" | "disputed" | "suspended";
export type EmailStatus = "verified" | "pending" | "disputed";

export interface User {
  id: number;
  email: string;
  password_hash: string;
  name: string;
  role: Role;
  account_status: AccountStatus;
  headline: string;
  bio: string;
  skills: string;
  must_change_password: number;
  image_consent: number;
  public_profile_consent: number;
  public_profile_consent_at: string | null;
  show_email: number;
  /** Assinatura cursiva nos certificados: null usa o nome; vazio, sem assinatura. */
  signature_name: string | null;
  email_network: number;
  email_reminders: number;
  news_consent: number;
  email_status: EmailStatus;
  email_verified_at: string | null;
  employment_terms_accepted_at: string | null;
  code_of_conduct_accepted_at: string | null;
  created_at: string;
}

export interface Mentorship {
  id: number;
  mentor_id: number;
  mentee_id: number;
  status: "pending" | "active";
  created_at: string;
}

export interface Contribution {
  id: number;
  user_id: number;
  title: string;
  url: string;
  type: string;
  description: string;
  created_at: string;
}

export interface Invite {
  email: string;
  role: Role;
  created_at: string;
}

export interface Opportunity {
  id: number;
  owner_id: number;
  type: "open_source" | "evento" | "vaga";
  title: string;
  description: string;
  skills: string;
  created_at: string;
}

export type EventModality = "online" | "in_person" | "hybrid";
export type EventStatus = "draft" | "published" | "cancelled";
export type RegistrationStatus = "requested" | "approved" | "waitlist" | "declined" | "cancelled";

export interface PlatformEvent {
  id: number;
  owner_id: number;
  title: string;
  description: string;
  modality: EventModality;
  starts_at: string;
  ends_at: string;
  online_url: string;
  location: string;
  capacity: number | null;
  require_approval: number;
  status: EventStatus;
  category: string;
  city: string;
  state: string;
  organizer: string;
  certificate_theme: string;
  approval_status: string;
  approval_note: string;
  website_url: string;
  created_at: string;
}

export interface Project {
  id: number;
  owner_id: number;
  kind: "particular" | "open_source" | "educacional" | "empresarial";
  title: string;
  summary: string;
  description: string;
  goals: string;
  tools: string;
  areas: string;
  difficulty: string;
  opportunity_type: string;
  modality: string;
  weekly_hours: string;
  starts_on: string;
  ends_on: string;
  slots: number | null;
  repo_url: string;
  help_needed: string;
  status: string;
  visibility: "public" | "private" | "invite";
  open_contribution: number;
  created_at: string;
  updated_at: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('mentor','mentee','company')),
  account_status TEXT NOT NULL DEFAULT 'active',
  headline TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  image_consent INTEGER NOT NULL DEFAULT 0,
  public_profile_consent INTEGER NOT NULL DEFAULT 0,
  public_profile_consent_at TEXT,
  employment_terms_accepted_at TEXT,
  code_of_conduct_accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS legal_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  doc TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS legal_acceptances_user ON legal_acceptances (user_id, doc);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_2fa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  secret TEXT NOT NULL,
  enabled_at TEXT,
  disabled_at TEXT,
  last_step INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_sessions (
  token_hash TEXT PRIMARY KEY,
  password_tag TEXT NOT NULL,
  idle_expires_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS admin_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code_hash TEXT NOT NULL UNIQUE,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS mentorships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(mentor_id, mentee_id)
);
CREATE TABLE IF NOT EXISTS contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'projeto',
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS endorsements (
  contribution_id INTEGER NOT NULL REFERENCES contributions(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (contribution_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS invites (
  email TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK(role IN ('mentor','mentee','company')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS opportunities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('open_source','evento','vaga')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  skills TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  modality TEXT NOT NULL CHECK(modality IN ('online','in_person','hybrid')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  online_url TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  capacity INTEGER,
  require_approval INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS event_registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('requested','approved','waitlist','declined','cancelled')),
  lgpd_accepted_at TEXT NOT NULL,
  communication_consent INTEGER NOT NULL DEFAULT 0,
  image_consent INTEGER NOT NULL DEFAULT 0,
  checked_in_at TEXT,
  checked_out_at TEXT,
  safe_home_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);
CREATE TABLE IF NOT EXISTS event_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','declined')),
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);
CREATE TABLE IF NOT EXISTS consent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent TEXT NOT NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  granted INTEGER NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS consent_events_user ON consent_events (user_id, consent);
CREATE TABLE IF NOT EXISTS availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  visible_to_mentors INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, weekday, start_time, end_time)
);
CREATE TABLE IF NOT EXISTS mentorship_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentorship_id INTEGER NOT NULL REFERENCES mentorships(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS company_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active')),
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(company_id, member_id)
);
CREATE TABLE IF NOT EXISTS company_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_link_id INTEGER NOT NULL REFERENCES company_links(id) ON DELETE CASCADE,
  scheduled_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
  proposed_by INTEGER,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meeting_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentorship_meeting_id INTEGER REFERENCES mentorship_meetings(id) ON DELETE CASCADE,
  company_meeting_id INTEGER REFERENCES company_meetings(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meeting_agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentorship_meeting_id INTEGER REFERENCES mentorship_meetings(id) ON DELETE CASCADE,
  company_meeting_id INTEGER REFERENCES company_meetings(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  done_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meeting_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentorship_meeting_id INTEGER REFERENCES mentorship_meetings(id) ON DELETE CASCADE,
  company_meeting_id INTEGER REFERENCES company_meetings(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS certificates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  mentorship_id INTEGER REFERENCES mentorships(id) ON DELETE SET NULL,
  issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  verification_code TEXT NOT NULL UNIQUE,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, event_id),
  UNIQUE(user_id, mentorship_id)
);
CREATE TABLE IF NOT EXISTS certificate_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_id INTEGER NOT NULL REFERENCES certificates(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  by_admin INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_certificate_history_certificate ON certificate_history(certificate_id);
CREATE TABLE IF NOT EXISTS auth_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  subject TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_attempts ON auth_attempts(action, subject, attempted_at);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_status_starts ON events(status, starts_at);
CREATE INDEX IF NOT EXISTS idx_registrations_event ON event_registrations(event_id, status);
CREATE INDEX IF NOT EXISTS idx_availability_user ON availability(user_id, weekday);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('particular','open_source','educacional','empresarial')),
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  goals TEXT NOT NULL DEFAULT '',
  tools TEXT NOT NULL DEFAULT '',
  areas TEXT NOT NULL DEFAULT '',
  difficulty TEXT NOT NULL DEFAULT '',
  opportunity_type TEXT NOT NULL DEFAULT '',
  modality TEXT NOT NULL DEFAULT '',
  weekly_hours TEXT NOT NULL DEFAULT '',
  starts_on TEXT NOT NULL DEFAULT '',
  ends_on TEXT NOT NULL DEFAULT '',
  slots INTEGER,
  repo_url TEXT NOT NULL DEFAULT '',
  help_needed TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'aberto',
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private','invite')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_access (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  PRIMARY KEY (project_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS project_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
CREATE TABLE IF NOT EXISTS project_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS learning_goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mentee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_on TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'andamento' CHECK(status IN ('andamento','concluida')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS goal_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  done INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goal_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  goal_id INTEGER NOT NULL REFERENCES learning_goals(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_mentor_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, mentor_id)
);
CREATE TABLE IF NOT EXISTS project_member_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_b INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','requested','declined')),
  requested_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  emailed_a_at TEXT,
  emailed_b_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_a, user_b)
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('resume','profile','project','meeting','event_material','event_evidence')),
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
  mentorship_meeting_id INTEGER REFERENCES mentorship_meetings(id) ON DELETE CASCADE,
  company_meeting_id INTEGER REFERENCES company_meetings(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  filename TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_on TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES project_tasks(id) ON DELETE CASCADE,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  attachment_id INTEGER REFERENCES attachments(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','changes')),
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_comment TEXT NOT NULL DEFAULT '',
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('mentorship','event')),
  mentorship_id INTEGER REFERENCES mentorships(id) ON DELETE SET NULL,
  event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
  subject_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  subject_role TEXT NOT NULL DEFAULT '',
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL DEFAULT '',
  as_agreed INTEGER,
  recommend INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('user','message','project','event','attachment')),
  target_id INTEGER NOT NULL,
  target_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  target_label TEXT NOT NULL DEFAULT '',
  message_body TEXT,
  reason TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','closed')),
  outcome TEXT CHECK(outcome IN ('archived','warned','suspended')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT '',
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS email_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  new_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS data_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  response TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  answered_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_deletions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  deleted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_projects_kind ON projects(kind, visibility, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at);
`;

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  return `${salt}:${crypto.scryptSync(password, salt, KEYLEN).toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, KEYLEN);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export type Statement = {
  get(...params: Param[]): Promise<Row | undefined>;
  all(...params: Param[]): Promise<Row[]>;
  run(...params: Param[]): Promise<RunResult>;
};
export type Db = { dialect: "sqlite" | "postgres"; prepare(sql: string): Statement; exec(sql: string): Promise<void> };

function makeDb(waitReady: boolean): Db {
  const d = getDriver();
  const ready = () => (waitReady ? ensureReady() : Promise.resolve());
  return {
    dialect: d.dialect,
    prepare: (sql) => ({
      get: async (...p) => (await ready(), d.get(sql, p)),
      all: async (...p) => (await ready(), d.all(sql, p)),
      run: async (...p) => (await ready(), d.run(sql, p)),
    }),
    exec: async (sql) => {
      await ready();
      await d.exec(sql);
    },
  };
}

let _db: Db | null = null;

/** Returns the database. Schema, migrations and demo seed run once, before the first query. */
export function getDb(): Db {
  return (_db ??= makeDb(true));
}

let _ready: Promise<void> | null = null;
function ensureReady(): Promise<void> {
  _ready ??= init().catch((e) => {
    _ready = null;
    throw e;
  });
  return _ready;
}

const PG_DATETIME = `CREATE OR REPLACE FUNCTION datetime(text) RETURNS text LANGUAGE sql VOLATILE AS
$fn$ SELECT to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') $fn$;`;

function postgresSchema(schema: string): string {
  return schema
    .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, "SERIAL PRIMARY KEY")
    .replace(/expires_at INTEGER/g, "expires_at BIGINT")
    .replace(/attempted_at INTEGER/g, "attempted_at BIGINT");
}

async function init() {
  const d = getDriver();
  const db = makeDb(false);
  setIdTables([...SCHEMA.matchAll(/CREATE TABLE IF NOT EXISTS (\w+) \(\s*id INTEGER PRIMARY KEY AUTOINCREMENT/g)].map((m) => m[1]));
  await d.withLock(async () => {
    if (d.dialect === "postgres") {
      await d.exec(PG_DATETIME);
      await d.exec(postgresSchema(SCHEMA));
    } else {
      await d.exec(SCHEMA);
    }
    await ensureMigrations(db);
    await seedIfEmpty(db);
    await seedEducation(db);
    await upgradeDemoPasswords(db);
    await backfillLegalAcceptances(db);
    await backfillConsents(db);
    await backfillCertificateHistory(db);
  });
}

async function ensureMigrations(db: Db) {
  await addColumns(db, "users", {
    must_change_password: "INTEGER NOT NULL DEFAULT 0",
    account_status: "TEXT NOT NULL DEFAULT 'active'",
    image_consent: "INTEGER NOT NULL DEFAULT 0",
    public_profile_consent: "INTEGER NOT NULL DEFAULT 0",
    public_profile_consent_at: "TEXT",
    employment_terms_accepted_at: "TEXT",
    code_of_conduct_accepted_at: "TEXT",
    show_email: "INTEGER NOT NULL DEFAULT 0",
    email_status: "TEXT NOT NULL DEFAULT 'verified'",
    email_verified_at: "TEXT",
    email_network: "INTEGER NOT NULL DEFAULT 1",
    email_reminders: "INTEGER NOT NULL DEFAULT 1",
    news_consent: "INTEGER NOT NULL DEFAULT 0",
    signature_name: "TEXT",
  });
  await addColumns(db, "events", {
    category: "TEXT NOT NULL DEFAULT ''",
    city: "TEXT NOT NULL DEFAULT ''",
    state: "TEXT NOT NULL DEFAULT ''",
    organizer: "TEXT NOT NULL DEFAULT ''",
    certificate_theme: "TEXT NOT NULL DEFAULT 'classico'",
    review_invited_at: "TEXT",
    approval_status: "TEXT NOT NULL DEFAULT 'approved'",
    approval_note: "TEXT NOT NULL DEFAULT ''",
    website_url: "TEXT NOT NULL DEFAULT ''",
  });
  await addColumns(db, "reports", { sensitive: "INTEGER NOT NULL DEFAULT 0" });
  await addColumns(db, "certificates", {
    workload_minutes: "INTEGER",
    organizer_name: "TEXT",
    responsible_name: "TEXT",
    theme: "TEXT",
    responsible_signature: "TEXT",
    revoked_at: "TEXT",
    revoked_by: "INTEGER",
    revoke_reason: "TEXT",
  });
  await addColumns(db, "projects", {
    open_contribution: "INTEGER NOT NULL DEFAULT 0",
    owner_function: "TEXT NOT NULL DEFAULT ''",
  });
  await addColumns(db, "project_applications", {
    project_role: "TEXT NOT NULL DEFAULT 'participant'",
    project_function: "TEXT NOT NULL DEFAULT ''",
  });
  await addColumns(db, "project_access", {
    project_function: "TEXT NOT NULL DEFAULT ''",
  });
  await addColumns(db, "event_registrations", {
    safe_home_reminded_at: "TEXT",
  });
  await addColumns(db, "mentorship_meetings", {
    proposed_by: "INTEGER",
    confirmed_at: "TEXT",
  });
  await addColumns(db, "mentorships", {
    objective: "TEXT NOT NULL DEFAULT ''",
    message: "TEXT NOT NULL DEFAULT ''",
    requested_by: "TEXT NOT NULL DEFAULT 'mentee'",
    completed_at: "TEXT",
    completed_by: "INTEGER",
  });
  await keepCertificatesWithoutIssuer(db);
  await allowAttachmentReports(db);
  await allowCompletedMentorships(db);
}

/** Mentoria concluida: amplia a regra da situacao, mantendo todas as mentorias existentes. */
async function allowCompletedMentorships(db: Db) {
  if (db.dialect === "postgres") {
    const c = (await db.prepare(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'mentorships'::regclass AND conname = 'mentorships_status_check'"
    ).get()) as { def: string } | undefined;
    if (!c || c.def.includes("completed")) return;
    await db.exec(`ALTER TABLE mentorships DROP CONSTRAINT mentorships_status_check;
      ALTER TABLE mentorships ADD CONSTRAINT mentorships_status_check CHECK (status IN ('pending','active','completed'));`);
    return;
  }
  const t = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mentorships'").get()) as { sql: string } | undefined;
  const oldCheck = "CHECK(status IN ('pending','active'))";
  if (!t || t.sql.includes("'completed'") || !t.sql.includes(oldCheck)) return;
  const indexes = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'mentorships' AND sql IS NOT NULL").all()) as { sql: string }[];
  const created = t.sql.replace(oldCheck, "CHECK(status IN ('pending','active','completed'))").replace(/^CREATE TABLE "?mentorships"?/, "CREATE TABLE mentorships_new");
  await db.exec(`BEGIN;
    ${created};
    INSERT INTO mentorships_new SELECT * FROM mentorships;
    DROP TABLE mentorships;
    ALTER TABLE mentorships_new RENAME TO mentorships;
    ${indexes.map((i) => `${i.sql};`).join("\n")}
    COMMIT;`);
}

/** Denuncias de arquivo: amplia a regra do tipo de alvo, mantendo todas as denuncias existentes. */
async function allowAttachmentReports(db: Db) {
  if (db.dialect === "postgres") {
    const c = (await db.prepare(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'reports'::regclass AND conname = 'reports_target_type_check'"
    ).get()) as { def: string } | undefined;
    if (!c || c.def.includes("attachment")) return;
    await db.exec(`ALTER TABLE reports DROP CONSTRAINT reports_target_type_check;
      ALTER TABLE reports ADD CONSTRAINT reports_target_type_check CHECK (target_type IN ('user','message','project','event','attachment'));`);
    return;
  }
  const t = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'reports'").get()) as { sql: string } | undefined;
  const oldCheck = "'project','event'))";
  if (!t || t.sql.includes("'attachment'") || !t.sql.includes(oldCheck)) return;
  const indexes = (await db.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'reports' AND sql IS NOT NULL").all()) as { sql: string }[];
  const created = t.sql.replace(oldCheck, "'project','event','attachment'))").replace(/^CREATE TABLE "?reports"?/, "CREATE TABLE reports_new");
  await db.exec(`BEGIN;
    ${created};
    INSERT INTO reports_new SELECT * FROM reports;
    DROP TABLE reports;
    ALTER TABLE reports_new RENAME TO reports;
    ${indexes.map((i) => `${i.sql};`).join("\n")}
    COMMIT;`);
}

/** Certificados continuam validos quando quem emitiu exclui a conta. No SQLite as chaves estrangeiras nao sao aplicadas. */
async function keepCertificatesWithoutIssuer(db: Db) {
  if (db.dialect !== "postgres") return;
  const fk = (await db.prepare(
    "SELECT delete_rule FROM information_schema.referential_constraints WHERE constraint_name = 'certificates_issued_by_fkey'"
  ).get()) as { delete_rule: string } | undefined;
  if (fk?.delete_rule !== "CASCADE") return;
  await db.exec(`ALTER TABLE certificates ALTER COLUMN issued_by DROP NOT NULL;
    ALTER TABLE certificates DROP CONSTRAINT certificates_issued_by_fkey;
    ALTER TABLE certificates ADD CONSTRAINT certificates_issued_by_fkey FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL;`);
}

/** Contas com aceite gravado antes do versionamento recebem a versao 1, com a data original. */
/** Linha do tempo dos certificados emitidos antes dela: auditoria, emissao e revogacao atual. */
async function backfillCertificateHistory(db: Db) {
  await db.exec(`INSERT INTO certificate_history (certificate_id, action, actor_id, by_admin, reason, created_at)
    SELECT a.entity_id,
      CASE a.action WHEN 'certificate.issued' THEN 'issued' WHEN 'certificate.self_issued' THEN 'self_issued'
        WHEN 'certificate.revoked' THEN 'revoked' WHEN 'certificate.revoked_by_admin' THEN 'revoked' ELSE 'unrevoked' END,
      a.actor_id, CASE WHEN a.action LIKE '%by_admin' THEN 1 ELSE 0 END, NULL, a.created_at
    FROM audit_log a JOIN certificates c ON c.id = a.entity_id
    WHERE a.entity_type = 'certificate'
      AND a.action IN ('certificate.issued','certificate.self_issued','certificate.revoked','certificate.revoked_by_admin','certificate.unrevoked','certificate.unrevoked_by_admin')
      AND NOT EXISTS (SELECT 1 FROM certificate_history h WHERE h.certificate_id = c.id)
    ORDER BY a.id;`);
  await db.exec(`INSERT INTO certificate_history (certificate_id, action, actor_id, by_admin, reason, created_at)
    SELECT c.id, CASE WHEN c.issued_by = c.user_id THEN 'self_issued' ELSE 'issued' END, c.issued_by, 0, NULL, c.issued_at
    FROM certificates c
    WHERE NOT EXISTS (SELECT 1 FROM certificate_history h WHERE h.certificate_id = c.id AND h.action IN ('issued','self_issued'));`);
  await db.exec(`INSERT INTO certificate_history (certificate_id, action, actor_id, by_admin, reason, created_at)
    SELECT c.id, 'revoked', c.revoked_by, CASE WHEN c.revoked_by IS NULL THEN 1 ELSE 0 END, c.revoke_reason, c.revoked_at
    FROM certificates c
    WHERE c.revoked_at IS NOT NULL AND NOT EXISTS (SELECT 1 FROM certificate_history h WHERE h.certificate_id = c.id AND h.action = 'revoked');`);
  await db.exec(`UPDATE certificate_history SET reason = (SELECT c.revoke_reason FROM certificates c WHERE c.id = certificate_history.certificate_id AND c.revoked_at IS NOT NULL)
    WHERE action = 'revoked' AND reason IS NULL
      AND id = (SELECT MAX(h.id) FROM certificate_history h WHERE h.certificate_id = certificate_history.certificate_id AND h.action IN ('revoked','unrevoked'));`);
}

async function backfillLegalAcceptances(db: Db) {
  const docs: [string, string][] = [
    ["terms", "employment_terms_accepted_at"],
    ["privacy", "employment_terms_accepted_at"],
    ["conduct", "code_of_conduct_accepted_at"],
  ];
  for (const [doc, col] of docs) {
    await db.prepare(
      `INSERT INTO legal_acceptances (user_id, doc, version, source, accepted_at)
       SELECT u.id, ?, 1, 'anterior', u.${col} FROM users u
       WHERE u.${col} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM legal_acceptances a WHERE a.user_id = u.id AND a.doc = ?)`
    ).run(doc, doc);
  }
}

/** Consentimentos dados antes do historico recebem uma linha com o estado atual e a data ja gravada. */
async function backfillConsents(db: Db) {
  const userConsents: [string, string, string][] = [
    ["public_profile", "u.public_profile_consent = 1", "COALESCE(u.public_profile_consent_at, u.created_at)"],
    ["image", "u.image_consent = 1", "COALESCE(u.employment_terms_accepted_at, u.created_at)"],
  ];
  for (const [consent, where, at] of userConsents) {
    await db.prepare(
      `INSERT INTO consent_events (user_id, consent, event_id, granted, source, created_at)
       SELECT u.id, ?, NULL, 1, 'anterior', ${at} FROM users u
       WHERE ${where} AND NOT EXISTS (SELECT 1 FROM consent_events c WHERE c.user_id = u.id AND c.consent = ? AND c.event_id IS NULL)`
    ).run(consent, consent);
  }
  const eventConsents: [string, string, string][] = [
    ["event_privacy", "1 = 1", "r.lgpd_accepted_at"],
    ["event_communications", "r.communication_consent = 1", "r.created_at"],
    ["event_image", "r.image_consent = 1", "r.created_at"],
  ];
  for (const [consent, where, at] of eventConsents) {
    await db.prepare(
      `INSERT INTO consent_events (user_id, consent, event_id, granted, source, created_at)
       SELECT r.user_id, ?, r.event_id, 1, 'anterior', ${at} FROM event_registrations r
       WHERE ${where} AND NOT EXISTS (SELECT 1 FROM consent_events c WHERE c.user_id = r.user_id AND c.consent = ? AND c.event_id = r.event_id)`
    ).run(consent, consent);
  }
}

async function addColumns(db: Db, table: string, cols: Record<string, string>) {
  if (db.dialect === "postgres") {
    for (const [name, def] of Object.entries(cols)) await db.exec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${name} ${def};`);
    return;
  }
  const existing = (await db.prepare(`PRAGMA table_info(${table})`).all()).map((c) => c.name);
  for (const [name, def] of Object.entries(cols)) {
    if (!existing.includes(name)) await db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def};`);
  }
}

export type Profile = {
  show_impact?: boolean;
  tools?: string[];
  toolsOther?: string;
  learnTools?: string[];
  areas?: string[];
  help?: string[];
  days?: string[];
  periods?: string[];
  sessionDuration?: string;
  weeklyHours?: string;
  modality?: string;
  level?: string;
  maxMentees?: string;
  goals?: string;
  city?: string;
  state?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  companyType?: string;
  sector?: string;
  website?: string;
  cnpj?: string;
  responsible?: string;
  responsibleRole?: string;
  phone?: string;
  companySize?: string;
};

export async function getProfile(userId: number): Promise<Profile> {
  const row = (await getDb().prepare("SELECT data FROM profiles WHERE user_id = ?").get(userId)) as { data: string } | undefined;
  if (!row) return {};
  try {
    return JSON.parse(row.data) as Profile;
  } catch {
    return {};
  }
}

export async function saveProfile(userId: number, data: Profile) {
  await getDb()
    .prepare(
      `INSERT INTO profiles (user_id, data, updated_at) VALUES (?,?,datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    )
    .run(userId, JSON.stringify(data));
}

/** Share of the profile fields that matter for matching that are filled in (0..1). */
export function profileCompleteness(p: Profile, role: string): number {
  const keys: (keyof Profile)[] =
    role === "mentor"
      ? ["tools", "areas", "help", "days", "periods", "level", "modality", "weeklyHours"]
      : role === "mentee"
        ? ["tools", "learnTools", "areas", "days", "periods", "level", "modality", "goals"]
        : ["companyType", "sector", "responsible", "city", "website"];
  const filled = keys.filter((k) => {
    const v = p[k];
    return Array.isArray(v) ? v.length > 0 : !!v;
  });
  return filled.length / keys.length;
}

export async function notify(userId: number, body: string, link = "") {
  await getDb().prepare("INSERT INTO notifications (user_id, body, link) VALUES (?,?,?)").run(userId, body, link);
}

/** E-mail is shown to the person, to everyone logged in if they opted in, and to active connections (mentorship, company link or same project). */
export async function canSeeEmail(viewerId: number | null, target: { id: number; show_email: number }): Promise<boolean> {
  if (!viewerId) return false;
  if (viewerId === target.id || target.show_email) return true;
  const a = viewerId, b = target.id;
  const members = `SELECT owner_id AS uid, id AS pid FROM projects
    UNION SELECT user_id, project_id FROM project_applications WHERE status = 'accepted'
    UNION SELECT mentor_id, project_id FROM project_access WHERE revoked_at IS NULL`;
  const row = await getDb().prepare(
    `SELECT 1 FROM mentorships WHERE status = 'active' AND ((mentor_id = ? AND mentee_id = ?) OR (mentor_id = ? AND mentee_id = ?))
     UNION SELECT 1 FROM company_links WHERE status = 'active' AND ((company_id = ? AND member_id = ?) OR (company_id = ? AND member_id = ?))
     UNION SELECT 1 FROM (${members}) x JOIN (${members}) y ON x.pid = y.pid WHERE x.uid = ? AND y.uid = ?`
  ).get(a, b, b, a, a, b, b, a, a, b);
  return !!row;
}

export async function getUser(id: number): Promise<User | null> {
  const row = (await getDb().prepare("SELECT * FROM users WHERE id = ?").get(id)) as
    | User
    | undefined;
  return row ?? null;
}

export async function audit(
  actorId: number | null,
  action: string,
  entityType: string,
  entityId: number | null
) {
  await getDb()
    .prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id) VALUES (?,?,?,?)")
    .run(actorId, action, entityType, entityId);
}

export const DEMO_PASSWORD = "Ponte@2026";
const DEMO_EMAILS = ["ana@ponte.dev", "carlos@ponte.dev", "rita@ponte.dev", "contato@techcorp.dev", "joao@email.com", "maria@email.com", "pedro@email.com"];

// Contas de demo criadas com a senha antiga ("senha123") passam para a senha que atende a politica atual.
async function upgradeDemoPasswords(db: Db) {
  if (process.env.SEED_DEMO === "0" || process.env.VERCEL_ENV === "production") return;
  for (const email of DEMO_EMAILS) {
    const row = (await db.prepare("SELECT id, password_hash FROM users WHERE email = ?").get(email)) as { id: number; password_hash: string } | undefined;
    if (row && verifyPassword("senha123", row.password_hash)) {
      await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(DEMO_PASSWORD), row.id);
    }
  }
}

async function seedIfEmpty(db: Db) {
  if (process.env.SEED_DEMO === "0" || process.env.VERCEL_ENV === "production") return;
  const { n } = (await db.prepare("SELECT COUNT(*) AS n FROM users").get()) as { n: number };
  if (n > 0) return;

  const pw = hashPassword(DEMO_PASSWORD);
  const insertUser = db.prepare(
    "INSERT INTO users (email, password_hash, name, role, headline, bio, skills) VALUES (?,?,?,?,?,?,?)"
  );
  const insertMentorship = db.prepare(
    "INSERT INTO mentorships (mentor_id, mentee_id, status) VALUES (?,?,?)"
  );
  const insertContribution = db.prepare(
    "INSERT INTO contributions (user_id, title, url, type, description) VALUES (?,?,?,?,?)"
  );
  const insertEndorsement = db.prepare(
    "INSERT INTO endorsements (contribution_id, mentor_id) VALUES (?,?)"
  );
  const insertOpportunity = db.prepare(
    "INSERT INTO opportunities (owner_id, type, title, description, skills) VALUES (?,?,?,?,?)"
  );

  const ana = await newId(insertUser, 
      "ana@ponte.dev", pw, "Ana Souza", "mentor",
      "Engenheira de software senior - 15 anos de estrada",
      "Construi sistemas de pagamento e plataformas em escala. Mentoro pessoas em transicao para desenvolvimento e quem busca a primeira vaga.",
      "Backend, Node.js, Arquitetura, Carreira, Entrevistas"
    );
  const carlos = await newId(insertUser, 
      "carlos@ponte.dev", pw, "Carlos Lima", "mentor",
      "Cientista de dados - ex-big tech",
      "Apaixonado por ensinar estatistica aplicada e machine learning do zero. Ajudo a montar portfolio de dados.",
      "Python, Machine Learning, SQL, Portfolio"
    );
  const rita = await newId(insertUser, 
      "rita@ponte.dev", pw, "Rita Fernandes", "mentor",
      "Head de Produto",
      "De QA a lideranca de produto. Mentoro quem quer entrar em produto, UX ou gestao.",
      "Produto, UX, Discovery, Lideranca"
    );
  const techcorp = await newId(insertUser, 
      "contato@techcorp.dev", pw, "TechCorp", "company",
      "Startup de tecnologia - programa de formacao proprio",
      "Mentoramos e formamos talentos juniores dentro dos nossos projetos reais.",
      "Programa de formacao, Estagio, Junior"
    );
  const joao = await newId(insertUser, 
      "joao@email.com", pw, "Joao Pedro", "mentee",
      "Em transicao para desenvolvimento web",
      "Ex-professor aprendendo a programar. Buscando primeira oportunidade como dev junior.",
      "JavaScript, React, HTML, CSS"
    );
  const maria = await newId(insertUser, 
      "maria@email.com", pw, "Maria Clara", "mentee",
      "Estudante de ADS - buscando primeiro emprego",
      "2o semestre de Analise e Desenvolvimento de Sistemas. Gosto de dados e automacao.",
      "Python, SQL, Git"
    );
  const pedro = await newId(insertUser, 
      "pedro@email.com", pw, "Pedro Santos", "mentee",
      "42 anos - migrando de vendas para dados",
      "15 anos em vendas, agora estudando analise de dados. Experiencia de negocio + ferramentas novas.",
      "Excel, SQL, Python, Power BI"
    );

  await insertMentorship.run(ana, joao, "active");
  await insertMentorship.run(ana, maria, "active");
  await insertMentorship.run(carlos, maria, "active");
  await insertMentorship.run(rita, joao, "pending");
  await insertMentorship.run(techcorp, pedro, "active");

  const c1 = await newId(insertContribution, 
      joao, "PR aceito no repositorio open-source 'dev-brasil-docs'",
      "https://github.com", "open_source",
      "Corrigi e traduzi a documentacao de contribuicao do projeto."
    );
  await insertContribution.run(
    joao, "Clone da landing page de um e-commerce",
    "https://github.com", "projeto",
    "Reproduzi uma landing page real usando apenas HTML, CSS e um pouco de JS."
  );
  const c2 = await newId(insertContribution, 
      maria, "Analise exploratoria do dataset 'Desmatamento na Amazonia'",
      "https://github.com", "projeto",
      "Notebook com limpeza de dados, graficos e insights sobre series historicas."
    );
  await insertContribution.run(
    maria, "Lightning talk no meetup PyLadies",
    "", "evento",
    "Apresentei 10 minutos sobre web scraping etico para uma plateia de 80 pessoas."
  );
  const c3 = await newId(insertContribution, 
      pedro, "Dashboard de pipeline de vendas em Power BI",
      "", "projeto",
      "Automatizei o relatorio mensal da equipe com dados do CRM exportados via SQL."
    );

  await insertEndorsement.run(c1, ana);
  await insertEndorsement.run(c2, carlos);
  await insertEndorsement.run(c3, techcorp);

  await insertOpportunity.run(
    techcorp, "vaga", "Programa de Formacao TechCorp 2026",
    "6 meses de formacao remunerada para devs juniores dentro dos nossos times. Mentoria dedicada e projeto real no final.",
    "Logica, Git, Vontade de aprender"
  );
  await insertOpportunity.run(
    ana, "open_source", "Contribuidores para o Ponte (este projeto!)",
    "A plataforma e open source. Procuramos contribuidores de todos os niveis - otima primeira contribuicao.",
    "TypeScript, Next.js, SQLite"
  );
  await insertOpportunity.run(
    rita, "evento", "Workshop: discovery de produto na pratica",
    "Workshop gratuito de 3h. Vamos descobrir um produto do zero em grupo. Aberto a mentorados e mentores.",
    "Produto, UX, Curiosidade"
  );

  const insertEvent = db.prepare(
    `INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location, capacity, require_approval)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
  );
  await insertEvent.run(
    ana,
    "Encontro Ponte: primeiros passos em tecnologia",
    "Uma conversa aberta para quem esta iniciando ou fazendo transicao de carreira. Traga suas perguntas.",
    "hybrid",
    "2027-01-20T19:00",
    "2027-01-20T21:00",
    "https://meet.google.com/ponte-demo",
    "Hub Ponte — Sao Paulo, SP",
    30,
    0
  );
}

async function seedEducation(db: Db) {
  if (process.env.SEED_DEMO === "0" || process.env.VERCEL_ENV === "production") return;
  const { n } = (await db.prepare("SELECT COUNT(*) AS n FROM profiles").get()) as { n: number };
  if (n > 0) return;
  const idOf = async (email: string) =>
    ((await db.prepare("SELECT id FROM users WHERE email = ?").get(email)) as { id: number } | undefined)?.id;
  const ana = await idOf("ana@ponte.dev");
  const carlos = await idOf("carlos@ponte.dev");
  const rita = await idOf("rita@ponte.dev");
  const techcorp = await idOf("contato@techcorp.dev");
  const joao = await idOf("joao@email.com");
  const maria = await idOf("maria@email.com");
  const pedro = await idOf("pedro@email.com");
  if (!ana || !carlos || !rita || !techcorp || !joao || !maria || !pedro) return;
  // Demo accounts accept public visibility so the public pages have content to show.
  await db.prepare(
    `UPDATE users SET public_profile_consent = 1, public_profile_consent_at = datetime('now'),
       employment_terms_accepted_at = COALESCE(employment_terms_accepted_at, datetime('now')),
       code_of_conduct_accepted_at = COALESCE(code_of_conduct_accepted_at, datetime('now'))
     WHERE id IN (?,?,?,?,?,?,?)`
  ).run(ana, carlos, rita, techcorp, joao, maria, pedro);

  const put = async (id: number, p: Profile) =>
    await db.prepare("INSERT INTO profiles (user_id, data) VALUES (?,?)").run(id, JSON.stringify(p));
  await put(ana, {
    tools: ["JavaScript", "TypeScript", "React", "Node.js", "Git e GitHub", "Docker"],
    areas: ["Desenvolvimento Web", "Cloud Computing"],
    help: ["Revisar codigo", "Carreira e portfolio", "Preparar para entrevistas", "Apoiar open source", "Planejar projetos"],
    days: ["Terca", "Quinta"], periods: ["Noite"], sessionDuration: "1 hora", weeklyHours: "3 a 5 horas",
    modality: "Online", level: "Profissional senior", maxMentees: "5", city: "Sao Paulo", state: "SP",
  });
  await put(carlos, {
    tools: ["Python", "SQL", "Machine Learning", "Ciencia de Dados", "Power BI", "Git e GitHub"],
    areas: ["Analise de Dados", "Ciencia de Dados", "Machine Learning", "Inteligencia Artificial"],
    help: ["Tirar duvidas sobre ferramentas", "Tirar duvidas sobre projetos", "Desenvolver projetos dos mentorados", "Carreira e portfolio"],
    days: ["Segunda", "Quarta", "Sabado"], periods: ["Noite", "Manha"], sessionDuration: "1 hora", weeklyHours: "3 a 5 horas",
    modality: "Ambas", level: "Especialista", maxMentees: "4", city: "Recife", state: "PE",
  });
  await put(rita, {
    tools: ["Figma", "UX/UI", "Excel"],
    areas: ["UX/UI"],
    help: ["Planejar projetos", "Carreira e portfolio", "Preparar para entrevistas"],
    days: ["Sabado"], periods: ["Manha"], sessionDuration: "2 horas", weeklyHours: "1 a 2 horas",
    modality: "Presencial", level: "Profissional senior", maxMentees: "3", city: "Belo Horizonte", state: "MG",
  });
  await put(techcorp, {
    companyType: "Startup", sector: "Tecnologia", website: "https://techcorp.dev", responsible: "Luiza Prado",
    responsibleRole: "Coordenadora de talentos", city: "Sao Paulo", state: "SP", companySize: "51 a 200 pessoas",
  });
  await put(joao, {
    tools: ["JavaScript", "HTML e CSS", "React"], learnTools: ["TypeScript", "Node.js", "Git e GitHub"],
    areas: ["Desenvolvimento Web"], days: ["Terca", "Quinta", "Sabado"], periods: ["Noite"], weeklyHours: "6 a 10 horas",
    modality: "Online", level: "Em transicao de carreira", goals: "Conseguir a primeira vaga como dev junior construindo um portfolio com React e Node.js.",
    city: "Campinas", state: "SP",
  });
  await put(maria, {
    tools: ["Python", "SQL", "Git e GitHub"], learnTools: ["Power BI", "Machine Learning"],
    areas: ["Analise de Dados", "Automacao"], days: ["Segunda", "Quarta"], periods: ["Noite"], weeklyHours: "3 a 5 horas",
    modality: "Ambas", level: "Estudante universitario", goals: "Aprender analise de dados na pratica e participar de projetos open source.",
    city: "Recife", state: "PE",
  });
  await put(pedro, {
    tools: ["Excel", "SQL", "Python", "Power BI"], learnTools: ["Ciencia de Dados", "Machine Learning"],
    areas: ["Analise de Dados", "Ciencia de Dados"], days: ["Sabado"], periods: ["Manha", "Tarde"], weeklyHours: "3 a 5 horas",
    modality: "Online", level: "Em transicao de carreira", goals: "Migrar de vendas para analise de dados usando minha experiencia de negocio.",
    city: "Curitiba", state: "PR",
  });

  const insertProject = db.prepare(
    `INSERT INTO projects (owner_id, kind, title, summary, description, goals, tools, areas, difficulty, opportunity_type,
       modality, weekly_hours, slots, repo_url, help_needed, status, visibility)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  const p1 = await newId(insertProject, 
    maria, "particular", "Painel de evasao escolar do meu municipio",
    "Analise de dados publicos do INEP para entender a evasao no ensino medio.",
    "Projeto pessoal de portfolio. Estou limpando os microdados e quero montar um painel com os principais indicadores.",
    "Praticar pandas, SQL e visualizacao de dados.", "Python, SQL, Power BI", "Analise de Dados", "Intermediario", "Educacional",
    "Online", "3 a 5 horas", null, "", "Revisao da modelagem e sugestoes de graficos", "aberto", "public"
  );
  await db.prepare("INSERT INTO project_access (project_id, mentor_id) VALUES (?,?)").run(p1, carlos);
  await db.prepare("INSERT INTO project_feedback (project_id, author_id, body) VALUES (?,?,?)").run(
    p1, carlos, "Boa limpeza dos dados! Proximo passo: separar os indicadores por regiao antes de montar o painel."
  );
  const p2 = await newId(insertProject, 
    ana, "open_source", "Ponte — plataforma aberta de mentoria",
    "Contribua com a propria plataforma: acessibilidade, testes e novas funcionalidades.",
    "Projeto open source em Next.js e SQLite. Temos tarefas marcadas como 'primeira contribuicao'.",
    "Aprender fluxo de pull requests, revisao de codigo e testes.", "TypeScript, React, Git e GitHub", "Desenvolvimento Web",
    "Iniciante", "Open source", "Online", "1 a 2 horas", 10, "https://github.com/luanlimasoueu/aponte",
    "Testes automatizados, acessibilidade e documentacao", "aberto", "public"
  );
  await db.prepare("INSERT INTO project_applications (project_id, user_id, message, status) VALUES (?,?,?,?)").run(
    p2, joao, "Quero fazer minha primeira contribuicao open source com React.", "accepted"
  );
  const p3 = await newId(insertProject, 
    techcorp, "empresarial", "Dashboard de indicadores de vendas",
    "Projeto real da TechCorp para formar analistas de dados juniores.",
    "Os participantes vao construir um dashboard com dados anonimizados de vendas, com mentoria semanal do time de dados.",
    "Experiencia pratica com dados reais e apresentacao para stakeholders.", "Python, SQL, Power BI", "Analise de Dados",
    "Iniciante", "Estagio", "Online", "6 a 10 horas", 3, "", "", "aberto", "public"
  );
  await db.prepare("INSERT INTO project_applications (project_id, user_id, message) VALUES (?,?,?)").run(
    p3, pedro, "Tenho 15 anos de experiencia em vendas e ja uso Power BI e SQL."
  );
  await insertProject.run(
    carlos, "educacional", "Trilha guiada: primeiro modelo de Machine Learning",
    "Projeto educacional em grupo, do dataset ao modelo publicado.",
    "Quatro semanas, um encontro por semana. Cada etapa termina com uma entrega revisada pelo mentor.",
    "Entender o ciclo completo de um projeto de ML.", "Python, Machine Learning, Git e GitHub", "Machine Learning, Ciencia de Dados",
    "Iniciante", "Educacional", "Ambas", "3 a 5 horas", 8, "", "", "aberto", "public"
  );

  const goal = await newId(
    db.prepare("INSERT INTO learning_goals (mentee_id, project_id, title, description, due_on) VALUES (?,?,?,?,?)"),
    maria, p1, "Publicar meu primeiro painel de dados", "Terminar o painel de evasao escolar e apresentar ao mentor.", "2027-02-28"
  );
  const step = db.prepare("INSERT INTO goal_steps (goal_id, title, done) VALUES (?,?,?)");
  await step.run(goal, "Baixar e limpar os microdados do INEP", 1);
  await step.run(goal, "Modelar as tabelas em SQL", 1);
  await step.run(goal, "Montar o painel no Power BI", 0);
  await step.run(goal, "Apresentar resultados na mentoria", 0);
  await db.prepare("INSERT INTO goal_feedback (goal_id, author_id, body) VALUES (?,?,?)").run(
    goal, carlos, "Otimo progresso. Para o painel, comece por 3 indicadores e valide com dados de 2 anos."
  );

  await db.prepare("UPDATE events SET category = 'Meetup', city = 'Sao Paulo', state = 'SP', organizer = 'Comunidade Ponte' WHERE category = ''").run();
  const insertEvent = db.prepare(
    `INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location, capacity, require_approval, category, city, state, organizer)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  );
  await insertEvent.run(carlos, "Oficina pratica: analise de dados com Python",
    "Oficina presencial com notebooks prontos. Traga seu notebook; nao precisa saber programar.",
    "in_person", "2027-02-06T09:00", "2027-02-06T12:00", "", "Porto Digital — Rua do Apolo, 181", 25, 1,
    "Oficina pratica", "Recife", "PE", "Carlos Lima");
  await insertEvent.run(techcorp, "Apresentacao de projetos dos mentorados",
    "Mentorados apresentam projetos desenvolvidos com mentoria. Aberto a empresas e comunidade.",
    "online", "2027-03-10T19:00", "2027-03-10T21:00", "https://meet.google.com/ponte-projetos", "", null, 0,
    "Apresentacao de projetos", "", "", "TechCorp");
}

async function newId(stmt: Statement, ...params: Param[]): Promise<number> {
  return (await stmt.run(...params)).lastInsertRowid;
}
