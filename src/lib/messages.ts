import { getDb } from "./db";

export const MESSAGE_MAX = 2000;
export const MESSAGE_LIMIT = { max: 30, windowMin: 60 };
export const MESSAGE_EMAIL_GAP_MIN = 60;

export type ConversationStatus = "open" | "requested" | "declined";
export type ConversationRow = {
  id: number; user_a: number | null; user_b: number | null; status: ConversationStatus; requested_by: number | null;
  last_message_at: string; emailed_a_at: string | null; emailed_b_at: string | null;
};
export type ConversationItem = {
  id: number; status: ConversationStatus; requested_by: number | null; last_message_at: string;
  other_id: number | null; other_name: string | null; other_public: number | null; unread: number; last_body: string | null; last_sender: number | null;
};
export type MessageRow = { id: number; sender_id: number | null; body: string | null; read_at: string | null; created_at: string };

/** A conversa guarda o par sempre na mesma ordem, para existir uma so por par de pessoas. */
export function pair(a: number, b: number): [number, number] {
  return a < b ? [a, b] : [b, a];
}

export function otherOf(c: Pick<ConversationRow, "user_a" | "user_b">, me: number): number | null {
  return c.user_a === me ? c.user_b : c.user_a;
}

export function messageProblem(body: string): string | null {
  if (!body) return "Escreva a mensagem.";
  if (body.length > MESSAGE_MAX) return `A mensagem pode ter ate ${MESSAGE_MAX} caracteres.`;
  return null;
}

/** "AAAA-MM-DD HH:MM:SS" em UTC para data e hora de Brasilia. */
export function messageTime(at: string): string {
  return new Date(`${at.replace(" ", "T")}Z`).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

/**
 * Conversa direta, sem pedido de contato: mentoria, vinculo com empresa ou projeto ativo em comum,
 * ou quem escreve organiza um evento em que a outra pessoa esta inscrita.
 */
export async function canMessageDirect(from: number, to: number): Promise<boolean> {
  const members = `SELECT owner_id AS uid, id AS pid FROM projects
    UNION SELECT user_id, project_id FROM project_applications WHERE status = 'accepted'
    UNION SELECT mentor_id, project_id FROM project_access WHERE revoked_at IS NULL`;
  const row = await getDb().prepare(
    `SELECT 1 FROM mentorships WHERE status = 'active' AND ((mentor_id = ? AND mentee_id = ?) OR (mentor_id = ? AND mentee_id = ?))
     UNION SELECT 1 FROM company_links WHERE status = 'active' AND ((company_id = ? AND member_id = ?) OR (company_id = ? AND member_id = ?))
     UNION SELECT 1 FROM (${members}) x JOIN (${members}) y ON x.pid = y.pid WHERE x.uid = ? AND y.uid = ?
     UNION SELECT 1 FROM events e JOIN event_registrations r ON r.event_id = e.id
       WHERE e.owner_id = ? AND r.user_id = ? AND r.status IN ('requested','approved','waitlist')`
  ).get(from, to, to, from, from, to, to, from, from, to, from, to);
  return !!row;
}

export async function conversationBetween(a: number, b: number): Promise<ConversationRow | undefined> {
  const [x, y] = pair(a, b);
  return (await getDb().prepare("SELECT * FROM conversations WHERE user_a = ? AND user_b = ?").get(x, y)) as ConversationRow | undefined;
}

export async function getConversation(id: number, userId: number): Promise<ConversationRow | undefined> {
  return (await getDb().prepare("SELECT * FROM conversations WHERE id = ? AND (user_a = ? OR user_b = ?)").get(id, userId, userId)) as ConversationRow | undefined;
}

/** Conversas da pessoa. Pedidos que ela recusou nao aparecem para ela. */
export async function listConversations(userId: number): Promise<ConversationItem[]> {
  const rows = (await getDb().prepare(
    `SELECT c.id, c.status, c.requested_by, c.last_message_at, o.id AS other_id, o.name AS other_name, o.public_profile_consent AS other_public,
       (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND (m.sender_id IS NULL OR m.sender_id <> ?)) AS unread,
       (SELECT m.body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       (SELECT m.sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_sender
     FROM conversations c LEFT JOIN users o ON o.id = CASE WHEN c.user_a = ? THEN c.user_b ELSE c.user_a END
     WHERE (c.user_a = ? OR c.user_b = ?) AND NOT (c.status = 'declined' AND (c.requested_by IS NULL OR c.requested_by <> ?))
     ORDER BY c.last_message_at DESC, c.id DESC`
  ).all(userId, userId, userId, userId, userId)) as unknown as ConversationItem[];
  return rows.map((r) => ({ ...r, unread: Number(r.unread) }));
}

export async function conversationMessages(id: number): Promise<MessageRow[]> {
  return (await getDb().prepare("SELECT id, sender_id, body, read_at, created_at FROM messages WHERE conversation_id = ? ORDER BY id").all(id)) as unknown as MessageRow[];
}

/** Marca como lidas as mensagens da outra pessoa e o aviso do sino desta conversa. */
export async function markConversationRead(id: number, userId: number): Promise<void> {
  const db = getDb();
  await db.prepare("UPDATE messages SET read_at = datetime('now') WHERE conversation_id = ? AND read_at IS NULL AND (sender_id IS NULL OR sender_id <> ?)").run(id, userId);
  await db.prepare("UPDATE notifications SET read_at = datetime('now') WHERE user_id = ? AND link = ? AND read_at IS NULL").run(userId, `/mensagens?c=${id}`);
}

/** Mensagens nao lidas e pedidos de contato aguardando resposta, para o menu. */
export async function unreadMessageCount(userId: number): Promise<number> {
  const row = (await getDb().prepare(
    `SELECT COUNT(*) AS n FROM messages m JOIN conversations c ON c.id = m.conversation_id
     WHERE (c.user_a = ? OR c.user_b = ?) AND m.read_at IS NULL AND (m.sender_id IS NULL OR m.sender_id <> ?)
       AND (c.status = 'open' OR (c.status = 'requested' AND c.requested_by <> ?))`
  ).get(userId, userId, userId, userId)) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}
