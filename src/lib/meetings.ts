import { getDb } from "./db";
import { eventTimeMs, spTime } from "./event-time";

/** "mentorship": encontro de mentoria; "company": encontro entre a empresa e uma pessoa da rede dela. */
export type MeetingKind = "mentorship" | "company";

export type Meeting = {
  kind: MeetingKind; id: number; link_id: number; scheduled_at: string; duration_minutes: number; status: string;
  proposed_by: number | null; confirmed_at: string | null; created_at: string;
  other_id: number; other_name: string; other_role: string;
};

export type MeetingState = "pending" | "confirmed" | "completed" | "cancelled";

export const MEETING_LABEL: Record<MeetingState, string> = {
  pending: "Aguardando confirmacao", confirmed: "Confirmado", completed: "Concluido", cancelled: "Cancelado",
};

export const MEETING_TABLE: Record<MeetingKind, string> = { mentorship: "mentorship_meetings", company: "company_meetings" };

export function meetingState(m: Pick<Meeting, "status" | "confirmed_at">): MeetingState {
  if (m.status === "completed" || m.status === "cancelled") return m.status;
  return m.confirmed_at ? "confirmed" : "pending";
}

/** Quem aceita e a outra pessoa; encontros antigos, sem autor gravado, podem ser aceitos por qualquer uma das duas. */
export function canConfirmMeeting(m: Pick<Meeting, "status" | "confirmed_at" | "proposed_by">, userId: number): boolean {
  return m.status === "scheduled" && !m.confirmed_at && m.proposed_by !== userId;
}

export function meetingStarted(scheduledAt: string, now = Date.now()): boolean {
  return eventTimeMs(scheduledAt) <= now;
}

export function meetingTime(scheduledAt: string): string {
  return spTime(eventTimeMs(scheduledAt));
}

/** Encontros das mentorias ativas e dos vinculos ativos com empresas, com o nome da outra parte. */
export async function listMeetings(userId: number): Promise<Meeting[]> {
  return (await getDb().prepare(
    `SELECT 'mentorship' AS kind, mm.id, mm.mentorship_id AS link_id, mm.scheduled_at, mm.duration_minutes, mm.status, mm.proposed_by, mm.confirmed_at, mm.created_at,
            o.id AS other_id, o.name AS other_name, o.role AS other_role
     FROM mentorship_meetings mm JOIN mentorships m ON m.id = mm.mentorship_id
     JOIN users o ON o.id = CASE WHEN m.mentor_id = ? THEN m.mentee_id ELSE m.mentor_id END
     WHERE m.status = 'active' AND (m.mentor_id = ? OR m.mentee_id = ?)
     UNION ALL
     SELECT 'company' AS kind, cm.id, cm.company_link_id AS link_id, cm.scheduled_at, cm.duration_minutes, cm.status, cm.proposed_by, cm.confirmed_at, cm.created_at,
            o.id AS other_id, o.name AS other_name, o.role AS other_role
     FROM company_meetings cm JOIN company_links l ON l.id = cm.company_link_id
     JOIN users o ON o.id = CASE WHEN l.company_id = ? THEN l.member_id ELSE l.company_id END
     WHERE l.status = 'active' AND (l.company_id = ? OR l.member_id = ?)
     ORDER BY scheduled_at`
  ).all(userId, userId, userId, userId, userId, userId)) as unknown as Meeting[];
}

/** Coluna que liga notas, combinados e feedback ao encontro. */
export const MEETING_COL: Record<MeetingKind, string> = { mentorship: "mentorship_meeting_id", company: "company_meeting_id" };

const REF_PREFIX: Record<MeetingKind, string> = { mentorship: "mentoria", company: "empresa" };

export function meetingPath(kind: MeetingKind, id: number): string {
  return `/encontros/${REF_PREFIX[kind]}-${id}`;
}

export function parseMeetingRef(ref: string): { kind: MeetingKind; id: number } | null {
  const m = /^(mentoria|empresa)-(\d+)$/.exec(ref);
  return m ? { kind: m[1] === "empresa" ? "company" : "mentorship", id: Number(m[2]) } : null;
}

export type MeetingText = { id: number; author_id: number; author_name: string; body: string; done_at?: string | null; created_at: string };

export async function meetingDetails(kind: MeetingKind, id: number, userId: number) {
  const db = getDb();
  const col = MEETING_COL[kind];
  const note = (await db.prepare(`SELECT body, updated_at FROM meeting_notes WHERE ${col} = ? AND author_id = ?`).get(id, userId)) as
    | { body: string; updated_at: string } | undefined;
  const agreements = (await db.prepare(
    `SELECT a.id, a.author_id, u.name AS author_name, a.body, a.done_at, a.created_at FROM meeting_agreements a JOIN users u ON u.id = a.author_id
     WHERE a.${col} = ? ORDER BY a.created_at, a.id`
  ).all(id)) as unknown as MeetingText[];
  const feedback = (await db.prepare(
    `SELECT f.id, f.author_id, u.name AS author_name, f.body, f.created_at FROM meeting_feedback f JOIN users u ON u.id = f.author_id
     WHERE f.${col} = ? ORDER BY f.created_at, f.id`
  ).all(id)) as unknown as MeetingText[];
  return { note, agreements, feedback };
}
