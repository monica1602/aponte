import { getDb, notify } from "./db";
import { emailUser } from "./user-email";

export const INVITE_MAX = 50;
export const PENDING_EVENTS_MAX = 3;
export const REJECT_REASON_MAX = 300;

export type InviteRow = { user_id: number; name: string; role: string; status: string; sent_at: string | null; registered: number };
export type InviteOutcome = "ok" | "self" | "not_found" | "full" | "duplicate" | "blocked";
export type PendingEvent = {
  id: number; title: string; description: string; modality: string; starts_at: string; ends_at: string; category: string;
  location: string; city: string; state: string; website_url: string; price_cents: number; payment_url: string; owner_id: number; owner_name: string; invitees: string;
};

type Ev = { id: number; title: string; owner_id: number };

export async function pendingEventCount(ownerId: number): Promise<number> {
  const r = (await getDb().prepare("SELECT COUNT(*) AS n FROM events WHERE owner_id = ? AND approval_status = 'pending'").get(ownerId)) as { n: number };
  return Number(r.n);
}

async function sendInvite(eventId: number, title: string, inviterName: string, userId: number): Promise<void> {
  const text = `${inviterName} convidou voce para o evento "${title}". Veja os detalhes e inscreva-se, se quiser.`;
  await notify(userId, text, `/eventos/${eventId}`);
  await emailUser(userId, `Convite para o evento ${title}`, text, "Ver evento", `/eventos/${eventId}`, "network");
}

/** Convites de um evento ainda em aprovacao ficam guardados (sent_at NULL) e saem quando o admin aprova. */
export async function addInvite(event: Ev, inviterName: string, userId: number, sendNow: boolean): Promise<InviteOutcome> {
  const db = getDb();
  if (userId === event.owner_id) return "self";
  const target = await db.prepare("SELECT id FROM users WHERE id = ? AND account_status = 'active'").get(userId);
  if (!target) return "not_found";
  const blocked = await db.prepare(
    "SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)"
  ).get(event.owner_id, userId, userId, event.owner_id);
  if (blocked) return "blocked";
  const count = (await db.prepare("SELECT COUNT(*) AS n FROM event_invites WHERE event_id = ?").get(event.id)) as { n: number };
  if (Number(count.n) >= INVITE_MAX) return "full";
  try {
    await db.prepare(`INSERT INTO event_invites (event_id, user_id, invited_by, sent_at) VALUES (?,?,?,${sendNow ? "datetime('now')" : "NULL"})`)
      .run(event.id, userId, event.owner_id);
  } catch {
    return "duplicate";
  }
  if (sendNow) await sendInvite(event.id, event.title, inviterName, userId);
  return "ok";
}

export async function sendHeldInvites(event: Ev): Promise<number> {
  const db = getDb();
  const owner = (await db.prepare("SELECT name FROM users WHERE id = ?").get(event.owner_id)) as { name: string } | undefined;
  const held = (await db.prepare("SELECT id, user_id FROM event_invites WHERE event_id = ? AND sent_at IS NULL").all(event.id)) as unknown as { id: number; user_id: number }[];
  for (const i of held) {
    const done = await db.prepare("UPDATE event_invites SET sent_at = datetime('now') WHERE id = ? AND sent_at IS NULL").run(i.id);
    if (done.changes) await sendInvite(event.id, event.title, owner?.name ?? "Uma pessoa", i.user_id);
  }
  return held.length;
}

export async function approveEvent(id: number): Promise<{ event: Ev; invites: number } | null> {
  const db = getDb();
  const done = await db.prepare(
    "UPDATE events SET status = 'published', approval_status = 'approved', approval_note = '' WHERE id = ? AND approval_status = 'pending' AND status = 'draft'"
  ).run(id);
  if (!done.changes) return null;
  const event = (await db.prepare("SELECT id, title, owner_id FROM events WHERE id = ?").get(id)) as Ev;
  const invites = await sendHeldInvites(event);
  const text = `A administracao aprovou o evento "${event.title}". Ele ja aparece em Eventos${invites ? " e os convites foram enviados" : ""}.`;
  await notify(event.owner_id, text, `/eventos/${id}`);
  await emailUser(event.owner_id, `Evento aprovado: ${event.title}`, text, "Ver evento", `/eventos/${id}`, "network");
  return { event, invites };
}

export async function rejectEvent(id: number, reason: string): Promise<Ev | null> {
  const db = getDb();
  const done = await db.prepare(
    "UPDATE events SET approval_status = 'rejected', approval_note = ? WHERE id = ? AND approval_status = 'pending' AND status = 'draft'"
  ).run(reason, id);
  if (!done.changes) return null;
  const event = (await db.prepare("SELECT id, title, owner_id FROM events WHERE id = ?").get(id)) as Ev;
  const text = `A administracao recusou o evento "${event.title}". Motivo: ${reason}`;
  await notify(event.owner_id, text, `/eventos/${id}`);
  await emailUser(event.owner_id, `Evento recusado: ${event.title}`, text, "Ver evento", `/eventos/${id}`, "network");
  return event;
}

export async function declineInvite(eventId: number, userId: number): Promise<boolean> {
  const done = await getDb().prepare(
    "UPDATE event_invites SET status = 'declined' WHERE event_id = ? AND user_id = ? AND status = 'pending' AND sent_at IS NOT NULL"
  ).run(eventId, userId);
  return !!done.changes;
}

export async function myInvite(eventId: number, userId: number): Promise<{ status: string; inviter: string } | null> {
  const r = (await getDb().prepare(
    `SELECT i.status, u.name AS inviter FROM event_invites i LEFT JOIN users u ON u.id = i.invited_by
     WHERE i.event_id = ? AND i.user_id = ? AND i.sent_at IS NOT NULL`
  ).get(eventId, userId)) as { status: string; inviter: string | null } | undefined;
  return r ? { status: r.status, inviter: r.inviter ?? "A organizacao" } : null;
}

export async function listInvites(eventId: number): Promise<InviteRow[]> {
  return (await getDb().prepare(
    `SELECT i.user_id, u.name, u.role, i.status, i.sent_at,
       (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = i.event_id AND r.user_id = i.user_id AND r.status IN ('requested','approved','waitlist')) AS registered
     FROM event_invites i JOIN users u ON u.id = i.user_id WHERE i.event_id = ? ORDER BY u.name`
  ).all(eventId)) as unknown as InviteRow[];
}

/** Busca por nome; devolve so nome e tipo, nunca o e-mail. */
export async function searchInvitees(eventId: number, ownerId: number, q: string): Promise<{ id: number; name: string; role: string }[]> {
  const term = q.replace(/[%_\\]/g, "").trim().toLowerCase();
  if (term.length < 2) return [];
  return (await getDb().prepare(
    `SELECT u.id, u.name, u.role FROM users u
     WHERE u.account_status = 'active' AND u.id <> ? AND LOWER(u.name) LIKE ?
       AND NOT EXISTS (SELECT 1 FROM event_invites i WHERE i.event_id = ? AND i.user_id = u.id)
       AND NOT EXISTS (SELECT 1 FROM user_blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = ?))
     ORDER BY u.name LIMIT 10`
  ).all(ownerId, `%${term}%`, eventId, ownerId, ownerId)) as unknown as { id: number; name: string; role: string }[];
}

export async function pendingEvents(): Promise<PendingEvent[]> {
  return (await getDb().prepare(
    `SELECT e.id, e.title, e.description, e.modality, e.starts_at, e.ends_at, e.category, e.location, e.city, e.state, e.website_url, e.price_cents, e.payment_url, e.owner_id, u.name AS owner_name,
       COALESCE((SELECT GROUP_CONCAT(iu.name, ', ') FROM event_invites i JOIN users iu ON iu.id = i.user_id WHERE i.event_id = e.id), '') AS invitees
     FROM events e JOIN users u ON u.id = e.owner_id WHERE e.approval_status = 'pending' AND e.status = 'draft' ORDER BY e.created_at`
  ).all()) as unknown as PendingEvent[];
}
