import { getDb } from "./db";
import { eventTimeMs, spTime } from "./event-time";

export type Meeting = {
  id: number; mentorship_id: number; scheduled_at: string; duration_minutes: number; status: string;
  proposed_by: number | null; confirmed_at: string | null; created_at: string;
  mentor_id: number; mentee_id: number; other_id: number; other_name: string;
};

export type MeetingState = "pending" | "confirmed" | "completed" | "cancelled";

export const MEETING_LABEL: Record<MeetingState, string> = {
  pending: "Aguardando confirmacao", confirmed: "Confirmado", completed: "Concluido", cancelled: "Cancelado",
};

export function meetingState(m: Pick<Meeting, "status" | "confirmed_at">): MeetingState {
  if (m.status === "completed" || m.status === "cancelled") return m.status;
  return m.confirmed_at ? "confirmed" : "pending";
}

/** Quem confirma e a outra pessoa; encontros antigos, sem autor gravado, podem ser confirmados por qualquer uma das duas. */
export function canConfirmMeeting(m: Pick<Meeting, "status" | "confirmed_at" | "proposed_by">, userId: number): boolean {
  return m.status === "scheduled" && !m.confirmed_at && m.proposed_by !== userId;
}

export function meetingStarted(scheduledAt: string, now = Date.now()): boolean {
  return eventTimeMs(scheduledAt) <= now;
}

export function meetingTime(scheduledAt: string): string {
  return spTime(eventTimeMs(scheduledAt));
}

/** Encontros das mentorias ativas da pessoa, com o nome da outra parte. */
export async function listMeetings(userId: number): Promise<Meeting[]> {
  return (await getDb().prepare(
    `SELECT mm.id, mm.mentorship_id, mm.scheduled_at, mm.duration_minutes, mm.status, mm.proposed_by, mm.confirmed_at, mm.created_at,
            m.mentor_id, m.mentee_id, o.id AS other_id, o.name AS other_name
     FROM mentorship_meetings mm JOIN mentorships m ON m.id = mm.mentorship_id
     JOIN users o ON o.id = CASE WHEN m.mentor_id = ? THEN m.mentee_id ELSE m.mentor_id END
     WHERE m.status = 'active' AND (m.mentor_id = ? OR m.mentee_id = ?)
     ORDER BY mm.scheduled_at`
  ).all(userId, userId, userId)) as unknown as Meeting[];
}
