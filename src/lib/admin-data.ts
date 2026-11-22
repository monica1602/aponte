import { getDb, type Profile } from "./db";
import { splitCsv } from "./session";
import { PROJECT_STATUS } from "./catalog";

export type Role = "mentor" | "mentee" | "company";
export type Ref = { id: number; name: string; role?: string; extra?: string };
export type PersonRow = {
  id: number; name: string; email: string; role: Role; account_status: string; headline: string; created_at: string;
  profile: Profile;
  mentors: Ref[]; mentees: Ref[]; companies: Ref[]; projects: Ref[]; jointProjects: Ref[]; mentorsLinked: Ref[]; menteesLinked: Ref[];
};

type U = { id: number; name: string; email: string; role: Role; account_status: string; headline: string; created_at: string };
type M = { mentor_id: number; mentee_id: number; status: string; created_at: string };
type P = { id: number; owner_id: number; title: string; kind: string; status: string; tools: string; created_at: string };
type A = { project_id: number; user_id: number; status: string };
type X = { project_id: number; mentor_id: number };
type L = { company_id: number; member_id: number; status: string };

function uniq(list: Ref[]): Ref[] {
  const seen = new Set<number>();
  return list.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
}

async function load() {
  const db = getDb();
  const [users, ms, projects, apps, access, profiles, links] = await Promise.all([
    db.prepare("SELECT id, name, email, role, account_status, headline, created_at FROM users ORDER BY name").all(),
    db.prepare("SELECT mentor_id, mentee_id, status, created_at FROM mentorships").all(),
    db.prepare("SELECT id, owner_id, title, kind, status, tools, created_at FROM projects").all(),
    db.prepare("SELECT project_id, user_id, status FROM project_applications WHERE status IN ('pending','accepted')").all(),
    db.prepare("SELECT project_id, mentor_id FROM project_access WHERE revoked_at IS NULL").all(),
    db.prepare("SELECT user_id, data FROM profiles").all(),
    db.prepare("SELECT company_id, member_id, status FROM company_links").all(),
  ]);
  const prof = new Map<number, Profile>();
  for (const r of profiles as { user_id: number; data: string }[]) {
    try { prof.set(Number(r.user_id), JSON.parse(r.data)); } catch { /* ignore malformed */ }
  }
  return {
    users: (users as unknown as U[]).map((u) => ({ ...u, id: Number(u.id) })),
    ms: (ms as unknown as M[]).map((m) => ({ ...m, mentor_id: Number(m.mentor_id), mentee_id: Number(m.mentee_id) })),
    projects: (projects as unknown as P[]).map((p) => ({ ...p, id: Number(p.id), owner_id: Number(p.owner_id) })),
    apps: (apps as unknown as A[]).map((a) => ({ ...a, project_id: Number(a.project_id), user_id: Number(a.user_id) })),
    access: (access as unknown as X[]).map((a) => ({ project_id: Number(a.project_id), mentor_id: Number(a.mentor_id) })),
    links: (links as unknown as L[]).map((l) => ({ ...l, company_id: Number(l.company_id), member_id: Number(l.member_id) })),
    prof,
  };
}

export async function listPeople(role?: Role): Promise<PersonRow[]> {
  const { users, ms, projects, apps, access, links, prof } = await load();
  const byId = new Map(users.map((u) => [u.id, u]));
  const projById = new Map(projects.map((p) => [p.id, p]));
  const ref = (id: number, extra?: string): Ref => ({ id, name: byId.get(id)?.name ?? "?", role: byId.get(id)?.role, extra });
  const pref = (p: P, extra?: string): Ref => ({ id: p.id, name: p.title, extra });
  const st = (s: string) => (s === "active" || s === "accepted" ? "ativa" : "pendente");

  return users
    .filter((u) => !role || u.role === role)
    .map((u) => {
      const asMentee = ms.filter((m) => m.mentee_id === u.id);
      const asMentor = ms.filter((m) => m.mentor_id === u.id);
      const owned = projects.filter((p) => p.owner_id === u.id);
      const applied = apps.filter((a) => a.user_id === u.id).map((a) => ({ p: projById.get(a.project_id), s: a.status })).filter((x) => x.p) as { p: P; s: string }[];
      const shared = access.filter((a) => a.mentor_id === u.id).map((a) => projById.get(a.project_id)).filter(Boolean) as P[];
      const projectsList = uniq([
        ...owned.map((p) => pref(p, "criou")),
        ...applied.map((x) => pref(x.p, x.s === "accepted" ? "participa" : "candidatura")),
        ...shared.map((p) => pref(p, "acesso de mentor")),
      ]);
      const companyFromProjects = applied.map((x) => x.p.owner_id).filter((id) => byId.get(id)?.role === "company");
      const companyMentors = asMentee.map((m) => m.mentor_id).filter((id) => byId.get(id)?.role === "company");
      // Company side: people who applied to its projects, split by role.
      const applicants = apps.filter((a) => owned.some((p) => p.id === a.project_id)).map((a) => a.user_id);
      const joint = owned
        .map((p) => ({ p, members: apps.filter((a) => a.project_id === p.id && a.status === "accepted").map((a) => byId.get(a.user_id)?.name).filter(Boolean) }))
        .filter((x) => x.members.length > 0)
        .map((x) => pref(x.p, `com ${x.members.join(", ")}`));
      return {
        ...u,
        profile: prof.get(u.id) ?? {},
        mentors: asMentee.filter((m) => byId.get(m.mentor_id)?.role === "mentor").map((m) => ref(m.mentor_id, st(m.status))),
        mentees: asMentor.map((m) => ref(m.mentee_id, st(m.status))),
        companies: uniq([
          ...links.filter((l) => l.member_id === u.id).map((l) => ref(l.company_id, `rede ${st(l.status)}`)),
          ...[...companyMentors, ...companyFromProjects].map((id) => ref(id)),
        ]),
        projects: projectsList,
        jointProjects: joint,
        mentorsLinked: uniq([
          ...links.filter((l) => l.company_id === u.id && byId.get(l.member_id)?.role === "mentor").map((l) => ref(l.member_id, `rede ${st(l.status)}`)),
          ...applicants.filter((id) => byId.get(id)?.role === "mentor").map((id) => ref(id, "projeto")),
        ]),
        menteesLinked: uniq([
          ...links.filter((l) => l.company_id === u.id && byId.get(l.member_id)?.role === "mentee").map((l) => ref(l.member_id, `rede ${st(l.status)}`)),
          ...asMentor.map((m) => ref(m.mentee_id, `mentoria ${st(m.status)}`)),
          ...applicants.filter((id) => byId.get(id)?.role === "mentee").map((id) => ref(id, "projeto")),
        ]),
      };
    });
}

export type DashboardData = {
  totals: { mentee: number; mentor: number; company: number; project: number; mentorshipActive: number; mentorshipPending: number; participations: number; events: number; registrations: number };
  days: { date: string; mentee: number; mentor: number; company: number; project: number; mentorship: number }[];
  projectsByKind: { label: string; value: number }[];
  projectsByStatus: { label: string; value: number }[];
  tools: Record<"all" | Role | "project", { label: string; value: number }[]>;
  areas: { label: string; value: number }[];
};

const KIND: Record<string, string> = { particular: "Pessoal", open_source: "Open source", educacional: "Educacional", empresarial: "Empresarial" };
const STATUS: Record<string, string> = PROJECT_STATUS;

function tally(values: string[]): { label: string; value: number }[] {
  const m = new Map<string, number>();
  for (const v of values) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

export async function getDashboardData(): Promise<DashboardData> {
  const { users, ms, projects, apps, prof } = await load();
  const db = getDb();
  const [ev, regs] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM events").get(),
    db.prepare("SELECT COUNT(*) AS n FROM event_registrations").get(),
  ]);
  const day = (s: string) => String(s).slice(0, 10);
  const all = [...users.map((u) => day(u.created_at)), ...projects.map((p) => day(p.created_at)), ...ms.map((m) => day(m.created_at))].filter(Boolean).sort();
  const today = new Date().toISOString().slice(0, 10);
  const start = new Date(`${all[0] ?? today}T00:00:00Z`);
  const end = new Date(`${today}T00:00:00Z`);
  if ((end.getTime() - start.getTime()) / 864e5 > 365) start.setTime(end.getTime() - 365 * 864e5);
  const days: DashboardData["days"] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const k = d.toISOString().slice(0, 10);
    days.push({
      date: k,
      mentee: users.filter((u) => u.role === "mentee" && day(u.created_at) === k).length,
      mentor: users.filter((u) => u.role === "mentor" && day(u.created_at) === k).length,
      company: users.filter((u) => u.role === "company" && day(u.created_at) === k).length,
      project: projects.filter((p) => day(p.created_at) === k).length,
      mentorship: ms.filter((m) => day(m.created_at) === k).length,
    });
  }
  const toolsOf = (r: Role) => users.filter((u) => u.role === r).flatMap((u) => prof.get(u.id)?.tools ?? []);
  const projectTools = projects.flatMap((p) => splitCsv(p.tools));
  return {
    totals: {
      mentee: users.filter((u) => u.role === "mentee").length,
      mentor: users.filter((u) => u.role === "mentor").length,
      company: users.filter((u) => u.role === "company").length,
      project: projects.length,
      mentorshipActive: ms.filter((m) => m.status === "active").length,
      mentorshipPending: ms.filter((m) => m.status === "pending").length,
      participations: apps.filter((a) => a.status === "accepted").length,
      events: Number((ev as { n: number }).n),
      registrations: Number((regs as { n: number }).n),
    },
    days,
    projectsByKind: tally(projects.map((p) => KIND[p.kind] ?? p.kind)),
    projectsByStatus: tally(projects.map((p) => STATUS[p.status] ?? p.status)),
    tools: {
      all: tally([...toolsOf("mentor"), ...toolsOf("mentee"), ...toolsOf("company"), ...projectTools]),
      mentor: tally(toolsOf("mentor")),
      mentee: tally(toolsOf("mentee")),
      company: tally(toolsOf("company")),
      project: tally(projectTools),
    },
    areas: tally(users.flatMap((u) => prof.get(u.id)?.areas ?? [])),
  };
}

export async function getPersonDetail(id: number) {
  const db = getDb();
  const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(id)) as Record<string, unknown> | undefined;
  if (!user) return null;
  delete user.password_hash;
  const [row] = (await listPeople(user.role as Role)).filter((p) => p.id === id);
  const [contributions, registrations, goals] = await Promise.all([
    db.prepare("SELECT title, type, url, created_at FROM contributions WHERE user_id = ? ORDER BY created_at DESC").all(id),
    db.prepare("SELECT e.id, e.title, e.starts_at, r.status FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? ORDER BY e.starts_at DESC").all(id),
    db.prepare("SELECT title, status, created_at FROM learning_goals WHERE mentee_id = ? ORDER BY created_at DESC").all(id),
  ]);
  return { user, row, contributions, registrations, goals };
}
