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
