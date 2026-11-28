import { getDb, getProfile, profileCompleteness, type User } from "./db";
import { TOOLS, AREAS } from "./catalog";
import { matchMentee, matchMentor, rank, type MatchResult, type MenteeQuery, type MentorQuery } from "./matching";

export type Suggestion = { id: number; name: string; headline: string; match: MatchResult };
export type Suggestions = { items: Suggestion[]; needsProfile: boolean; searchHref: string };

const SUGGESTION_LIMIT = 3;

const csv = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);

type Row = { id: number; name: string; role: string; headline: string; endorsements?: number };

function hasCriteria(q: { tools: string[]; areas: string[]; days: string[]; periods: string[]; modality: string }): boolean {
  return q.tools.length + q.areas.length + q.days.length + q.periods.length > 0 || !!q.modality;
}

/** People already linked to the viewer (mentorship of any status, company link) or blocked in either direction. */
async function excludedIds(user: User): Promise<Set<number>> {
  const rows = (await getDb().prepare(
    `SELECT mentee_id AS id FROM mentorships WHERE mentor_id = ?
     UNION SELECT mentor_id FROM mentorships WHERE mentee_id = ?
     UNION SELECT member_id FROM company_links WHERE company_id = ?
     UNION SELECT blocked_id FROM user_blocks WHERE blocker_id = ?
     UNION SELECT blocker_id FROM user_blocks WHERE blocked_id = ?`
  ).all(user.id, user.id, user.id, user.id, user.id)) as unknown as { id: number }[];
  return new Set([user.id, ...rows.map((r) => Number(r.id))]);
}

/** Top mentors for a mentee, using the same query, candidates and order as /mentores with the person's own profile. */
async function mentorsFor(user: User): Promise<Suggestions> {
  const own = await getProfile(user.id);
  const query: MentorQuery = {
    tools: own.learnTools ?? [], areas: own.areas ?? [], help: [], days: own.days ?? [], periods: own.periods ?? [],
    experience: "Qualquer", modality: own.modality && own.modality !== "Ambas" ? own.modality : "",
  };
  if (!hasCriteria(query)) return { items: [], needsProfile: true, searchHref: "/mentores" };
  const skip = await excludedIds(user);
  const rows = (await getDb().prepare(
    `SELECT id, name, role, headline FROM users
     WHERE role IN ('mentor','company') AND account_status = 'active' AND public_profile_consent = 1`
  ).all()) as unknown as Row[];
  const scored = [];
  for (const m of rows.filter((r) => !skip.has(Number(r.id)))) {
    const p = await getProfile(m.id);
    const match = matchMentor(query, {
      tools: p.tools ?? [], areas: p.areas ?? [], help: p.help ?? [], days: p.days ?? [], periods: p.periods ?? [],
      level: p.level ?? "", modality: p.modality ?? "",
    });
    if (match && match.percent > 0) scored.push({ ...m, match, completeness: profileCompleteness(p, m.role) });
  }
  return { items: rank(scored).slice(0, SUGGESTION_LIMIT), needsProfile: false, searchHref: "/mentores" };
}

/** Top mentees for a mentor (own profile) or a company (latest open project), same scoring and order as /talentos. */
async function menteesFor(user: User): Promise<Suggestions> {
  const db = getDb();
  let query: MenteeQuery;
  let searchHref = "/talentos";
  if (user.role === "company") {
    const project = (await db.prepare(
      "SELECT id, tools, areas, modality FROM projects WHERE owner_id = ? AND status NOT IN ('rascunho','arquivado') ORDER BY updated_at DESC, id DESC LIMIT 1"
    ).get(user.id)) as { id: number; tools: string; areas: string; modality: string } | undefined;
    if (!project) return { items: [], needsProfile: true, searchHref };
    searchHref = `/talentos?projeto=${project.id}`;
    query = {
      tools: csv(project.tools).filter((t) => TOOLS.includes(t)), areas: csv(project.areas).filter((a) => AREAS.includes(a)),
      levels: [], days: [], periods: [], modality: project.modality === "Ambas" ? "" : project.modality,
    };
  } else {
    const own = await getProfile(user.id);
    query = {
      tools: own.tools ?? [], areas: own.areas ?? [], levels: [], days: own.days ?? [], periods: own.periods ?? [],
      modality: own.modality && own.modality !== "Ambas" ? own.modality : "",
    };
  }
  if (!hasCriteria(query)) return { items: [], needsProfile: true, searchHref };
  const skip = await excludedIds(user);
  const rows = (await db.prepare(
    `SELECT u.id, u.name, u.role, u.headline,
       (SELECT COUNT(*) FROM endorsements e JOIN contributions c ON c.id = e.contribution_id WHERE c.user_id = u.id) AS endorsements
     FROM users u WHERE u.role = 'mentee' AND u.account_status = 'active' AND u.public_profile_consent = 1`
  ).all()) as unknown as Row[];
  const scored = [];
  for (const t of rows.filter((r) => !skip.has(Number(r.id)))) {
    const p = await getProfile(t.id);
    const match = matchMentee(query, {
      knownTools: p.tools ?? [], learnTools: p.learnTools ?? [], areas: p.areas ?? [], level: p.level ?? "",
      goals: p.goals ?? "", days: p.days ?? [], periods: p.periods ?? [], modality: p.modality ?? "",
    });
    if (match && match.percent > 0) scored.push({ ...t, match, completeness: profileCompleteness(p, "mentee") + Number(t.endorsements ?? 0) / 100 });
  }
  return { items: rank(scored).slice(0, SUGGESTION_LIMIT), needsProfile: false, searchHref };
}

export async function dashboardSuggestions(user: User): Promise<Suggestions> {
  return user.role === "mentee" ? mentorsFor(user) : menteesFor(user);
}
