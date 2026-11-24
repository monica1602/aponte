import { getDb } from "./db";
import { eventTimeMs } from "./event-time";

export const REVIEW_COMMENT_MAX = 1000;
export const REVIEW_MIN_SHOW = 3;
export const REVIEW_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A avaliacao do evento abre no fim do evento e fica aberta por 30 dias. */
export function eventReviewOpen(endsAt: string, now = Date.now()): boolean {
  const end = eventTimeMs(endsAt);
  return !Number.isNaN(end) && end <= now && now - end <= REVIEW_WINDOW_DAYS * DAY_MS;
}

export function reviewProblem(rating: number, comment: string, sensitive: boolean, sensitiveText: string): string | null {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "Escolha uma nota de 1 a 5.";
  if (comment.length > REVIEW_COMMENT_MAX) return `O comentario pode ter ate ${REVIEW_COMMENT_MAX} caracteres.`;
  if (sensitive && !sensitiveText) return "Descreva o relato sensivel ou desmarque a opcao.";
  if (sensitiveText.length > REVIEW_COMMENT_MAX) return `O relato pode ter ate ${REVIEW_COMMENT_MAX} caracteres.`;
  return null;
}

export type MentorshipTarget = { id: number; other_id: number; other_name: string; other_side: "mentor" | "mentee" };
export async function mentorshipReviewTarget(userId: number, mentorshipId: number): Promise<MentorshipTarget | null> {
  const row = (await getDb().prepare(
    `SELECT m.id, m.mentor_id, m.mentee_id, u.name AS other_name FROM mentorships m
     JOIN users u ON u.id = CASE WHEN m.mentor_id = ? THEN m.mentee_id ELSE m.mentor_id END
     WHERE m.id = ? AND m.status = 'active' AND (m.mentor_id = ? OR m.mentee_id = ?)
       AND EXISTS (SELECT 1 FROM mentorship_meetings mm WHERE mm.mentorship_id = m.id AND mm.status = 'completed')`
  ).get(userId, mentorshipId, userId, userId)) as { id: number; mentor_id: number; mentee_id: number; other_name: string } | undefined;
  if (!row) return null;
  const isMentor = row.mentor_id === userId;
  return { id: row.id, other_id: isMentor ? row.mentee_id : row.mentor_id, other_name: row.other_name, other_side: isMentor ? "mentee" : "mentor" };
}

export type EventTarget = { id: number; title: string; owner_id: number };
export async function eventReviewTarget(userId: number, eventId: number): Promise<EventTarget | null> {
  const row = (await getDb().prepare(
    `SELECT e.id, e.title, e.owner_id, e.ends_at FROM events e JOIN event_registrations r ON r.event_id = e.id
     WHERE e.id = ? AND e.status = 'published' AND e.owner_id <> ? AND r.user_id = ? AND r.status = 'approved' AND r.checked_in_at IS NOT NULL`
  ).get(eventId, userId, userId)) as (EventTarget & { ends_at: string }) | undefined;
  return row && eventReviewOpen(row.ends_at) ? { id: row.id, title: row.title, owner_id: row.owner_id } : null;
}

export type Review = { id: number; rating: number; comment: string; as_agreed: number | null; recommend: number | null; updated_at: string };
export async function myReview(userId: number, kind: "mentorship" | "event", targetId: number): Promise<Review | null> {
  const col = kind === "mentorship" ? "mentorship_id" : "event_id";
  return ((await getDb().prepare(`SELECT id, rating, comment, as_agreed, recommend, updated_at FROM reviews WHERE author_id = ? AND kind = ? AND ${col} = ?`)
    .get(userId, kind, targetId)) as Review | undefined) ?? null;
}

const avg = (n: unknown) => Math.round(Number(n) * 10) / 10;

/** Resultado do evento para quem organiza: so a partir de 3 avaliacoes, sem nomes. */
export async function eventSummary(eventId: number) {
  const db = getDb();
  const s = (await db.prepare("SELECT COUNT(*) AS n, AVG(rating) AS avg FROM reviews WHERE kind = 'event' AND event_id = ?").get(eventId)) as { n: number; avg: number | null };
  const count = Number(s.n);
  if (count < REVIEW_MIN_SHOW) return { count, avg: null, comments: [] as string[] };
  const comments = (await db.prepare("SELECT comment FROM reviews WHERE kind = 'event' AND event_id = ? AND comment <> '' ORDER BY comment").all(eventId)) as { comment: string }[];
  return { count, avg: avg(s.avg), comments: comments.map((c) => c.comment) };
}

/** Media geral das mentorias de quem orienta, escrita pelos mentorados: so a partir de 3 avaliacoes, sem comentarios. */
export async function mentorSummary(mentorId: number) {
  const s = (await getDb().prepare(
    `SELECT COUNT(*) AS n, AVG(rating) AS avg, AVG(as_agreed) AS agreed, AVG(recommend) AS rec
     FROM reviews WHERE kind = 'mentorship' AND subject_id = ? AND subject_role = 'mentor'`
  ).get(mentorId)) as { n: number; avg: number | null; agreed: number | null; rec: number | null };
  const count = Number(s.n);
  if (count < REVIEW_MIN_SHOW) return { count, avg: null, agreedPct: null, recommendPct: null };
  return { count, avg: avg(s.avg), agreedPct: Math.round(Number(s.agreed) * 100), recommendPct: Math.round(Number(s.rec) * 100) };
}

export type AdminReview = {
  id: number; kind: "mentorship" | "event"; author_name: string | null; subject_name: string | null; event_title: string | null;
  rating: number; comment: string; as_agreed: number | null; recommend: number | null; updated_at: string;
};
export async function listAllReviews(): Promise<AdminReview[]> {
  return (await getDb().prepare(
    `SELECT r.id, r.kind, a.name AS author_name, s.name AS subject_name, e.title AS event_title, r.rating, r.comment, r.as_agreed, r.recommend, r.updated_at
     FROM reviews r LEFT JOIN users a ON a.id = r.author_id LEFT JOIN users s ON s.id = r.subject_id LEFT JOIN events e ON e.id = r.event_id
     ORDER BY r.updated_at DESC, r.id DESC LIMIT 500`
  ).all()) as unknown as AdminReview[];
}
