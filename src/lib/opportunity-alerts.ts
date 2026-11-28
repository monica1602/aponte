import { getDb, getProfile, notify } from "./db";
import { emailUser } from "./user-email";

export const OPPORTUNITY_ALERT_MAX = 50;
export const OPPORTUNITY_EMAILS_PER_DAY = 3;
const LINK_PREFIX = "/oportunidades#oportunidade-";

const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

// datetime('now') grava "AAAA-MM-DD HH:MM:SS" em UTC.
const dayAgo = (now: number) => new Date(now - 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");

/**
 * Avisa no sino os mentorados ativos que dominam pelo menos uma das skills da oportunidade
 * (ate 50, primeiro quem tem mais em comum). E-mail so para quem quer e-mails de rede, ate 3 por dia.
 */
export async function alertMatchingMentees(
  opp: { id: number; ownerId: number; title: string; skills: string },
  now = Date.now()
): Promise<{ notified: number[]; emailed: number[] }> {
  const db = getDb();
  const none = { notified: [], emailed: [] };
  const owner = (await db.prepare("SELECT public_profile_consent FROM users WHERE id = ?").get(opp.ownerId)) as { public_profile_consent: number } | undefined;
  if (!owner || Number(owner.public_profile_consent) !== 1) return none;

  const wanted = new Set(opp.skills.split(",").map(norm).filter(Boolean));
  if (wanted.size === 0) return none;

  const rows = (await db.prepare(
    `SELECT u.id FROM users u
     WHERE u.role = 'mentee' AND u.account_status = 'active' AND u.id <> ?
       AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))`
  ).all(opp.ownerId, opp.ownerId, opp.ownerId)) as unknown as { id: number }[];

  const matches: { id: number; common: string[] }[] = [];
  for (const r of rows) {
    const common = ((await getProfile(Number(r.id))).tools ?? []).filter((t) => wanted.has(norm(t)));
    if (common.length > 0) matches.push({ id: Number(r.id), common });
  }
  matches.sort((a, b) => b.common.length - a.common.length || a.id - b.id);

  const link = `${LINK_PREFIX}${opp.id}`;
  const since = dayAgo(now);
  const result = { notified: [] as number[], emailed: [] as number[] };
  for (const m of matches.slice(0, OPPORTUNITY_ALERT_MAX)) {
    const sent = (await db.prepare(
      "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND link LIKE ? AND created_at > ?"
    ).get(m.id, `${LINK_PREFIX}%`, since)) as { n: number };
    const body = `Nova oportunidade compativel: ${opp.title} (${m.common.join(", ")})`;
    await notify(m.id, body, link);
    result.notified.push(m.id);
    if (Number(sent.n) < OPPORTUNITY_EMAILS_PER_DAY) {
      await emailUser(m.id, `Nova oportunidade: ${opp.title}`, `${body}. Entre na Ponte para ver os detalhes.`, "Ver oportunidade", link, "network");
      result.emailed.push(m.id);
    }
  }
  return result;
}
