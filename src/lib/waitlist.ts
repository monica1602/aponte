import { audit, getDb } from "./db";
import { eventTimeMs } from "./event-time";

export type Promoted = { registrationId: number; userId: number; name: string; status: "approved" | "requested" };

/** Enquanto houver vaga, a inscricao mais antiga da lista de espera ocupa a vaga. */
export async function promoteWaitlist(eventId: number, actorId: number | null, now = Date.now()): Promise<Promoted[]> {
  const db = getDb();
  const event = (await db
    .prepare("SELECT capacity, require_approval, ends_at, status FROM events WHERE id = ?")
    .get(eventId)) as { capacity: number | null; require_approval: number; ends_at: string; status: string } | undefined;
  if (!event || event.status !== "published") return [];
  if (eventTimeMs(event.ends_at) <= now) return [];
  const status = event.require_approval ? "requested" : "approved";
  const promoted: Promoted[] = [];
  for (;;) {
    const filled = (await db
      .prepare("SELECT COUNT(*) AS count FROM event_registrations WHERE event_id = ? AND status IN ('requested','approved')")
      .get(eventId)) as { count: number };
    if (event.capacity !== null && Number(filled.count) >= event.capacity) break;
    const next = (await db
      .prepare(
        `SELECT r.id, r.user_id, u.name FROM event_registrations r JOIN users u ON u.id = r.user_id
         WHERE r.event_id = ? AND r.status = 'waitlist' ORDER BY r.created_at, r.id LIMIT 1`
      )
      .get(eventId)) as { id: number; user_id: number; name: string } | undefined;
    if (!next) break;
    const moved = await db.prepare("UPDATE event_registrations SET status = ? WHERE id = ? AND status = 'waitlist'").run(status, next.id);
    if (!moved.changes) continue;
    await audit(actorId, "event.waitlist_promoted", "event_registration", next.id);
    promoted.push({ registrationId: next.id, userId: next.user_id, name: next.name, status });
  }
  return promoted;
}
