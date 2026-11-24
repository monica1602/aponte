import { audit, getDb } from "./db";
import { eventTimeMs } from "./event-time";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Prazos de guarda publicados na Politica de Privacidade (versao 2). */
export const RETENTION_DAYS = {
  audit: 730,
  registrations: 365,
  safeHome: 2,
  certificateIssue: 365,
  messages: 730,
};

/** Certificados so podem ser emitidos ate 1 ano apos o fim do evento. */
export function canIssueCertificate(endsAt: string, now = Date.now()): boolean {
  const end = eventTimeMs(endsAt);
  return !Number.isNaN(end) && now - end <= RETENTION_DAYS.certificateIssue * DAY_MS;
}

/** A confirmacao de chegada so existe ate 2 dias apos o fim do evento. */
export function safeHomeOpen(endsAt: string, now = Date.now()): boolean {
  const end = eventTimeMs(endsAt);
  return Number.isNaN(end) || now - end < RETENTION_DAYS.safeHome * DAY_MS;
}

// Eventos guardam "AAAA-MM-DDTHH:MM" no horario de Brasilia (UTC-3).
function eventCutoff(days: number, now: number): string {
  return new Date(now - days * DAY_MS - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

// datetime('now') grava "AAAA-MM-DD HH:MM:SS" em UTC.
function utcCutoff(days: number, now: number): string {
  return new Date(now - days * DAY_MS).toISOString().slice(0, 19).replace("T", " ");
}

/** Apaga o que passou do prazo de guarda. Roda 1 vez por dia, na rotina diaria. */
export async function runRetention(now = Date.now()) {
  const db = getDb();
  const auditRows = await db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(utcCutoff(RETENTION_DAYS.audit, now));
  const registrations = await db.prepare(
    "DELETE FROM event_registrations WHERE event_id IN (SELECT id FROM events WHERE substr(ends_at, 1, 16) < ?)"
  ).run(eventCutoff(RETENTION_DAYS.registrations, now));
  const safeHome = await db.prepare(
    `UPDATE event_registrations SET safe_home_at = NULL, safe_home_reminded_at = COALESCE(safe_home_reminded_at, datetime('now'))
     WHERE safe_home_at IS NOT NULL AND event_id IN (SELECT id FROM events WHERE substr(ends_at, 1, 16) < ?)`
  ).run(eventCutoff(RETENTION_DAYS.safeHome, now));
  const oldConversations = "SELECT id FROM conversations WHERE last_message_at < ?";
  await db.prepare(`DELETE FROM messages WHERE conversation_id IN (${oldConversations})`).run(utcCutoff(RETENTION_DAYS.messages, now));
  const conversations = await db.prepare(`DELETE FROM conversations WHERE id IN (${oldConversations})`).run(utcCutoff(RETENTION_DAYS.messages, now));
  const result = { audit: auditRows.changes, registrations: registrations.changes, safeHome: safeHome.changes, conversations: conversations.changes };
  await audit(null, `retention.cleanup auditoria=${result.audit} inscricoes=${result.registrations} chegada=${result.safeHome} conversas=${result.conversations}`, "retention", null);
  return result;
}
