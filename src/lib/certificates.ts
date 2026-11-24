import { getDb } from "./db";
import { eventTimeMs } from "./event-time";
import type { CertificateData } from "./certificate-pdf";
import type { HistoryAction, HistoryEntry } from "./certificate-history";

type Row = Omit<CertificateData, "workload_minutes" | "organizer_name" | "responsible_name" | "responsible_signature" | "theme"> & {
  workload_minutes: number | null; organizer_name: string | null; responsible_name: string | null; theme: string | null;
  responsible_signature: string | null; owner_signature: string | null;
  id: number; user_id: number; owner_id: number | null; revoked_at: string | null; revoked_by: number | null; revoke_reason: string | null;
  ends_at: string | null; event_organizer: string | null; owner_name: string | null; event_theme: string | null;
};

export function workloadMinutes(startsAt: string, endsAt: string): number | null {
  const minutes = Math.round((eventTimeMs(endsAt) - eventTimeMs(startsAt)) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

export type LoadedCertificate = CertificateData & {
  id: number; user_id: number; owner_id: number | null;
  revoked_at: string | null; revoked_by: number | null; revoke_reason: string | null;
};

/** Dados do certificado: os gravados na emissao e, nos certificados antigos, os dados atuais do evento. */
export async function loadCertificate(code: string): Promise<LoadedCertificate | undefined> {
  const r = (await getDb().prepare(
    `SELECT c.id, c.user_id, e.owner_id, c.revoked_at, c.revoked_by, c.revoke_reason, c.title, c.verification_code, c.issued_at, c.workload_minutes, c.organizer_name, c.responsible_name, c.theme, c.responsible_signature,
            u.name AS recipient_name, e.starts_at, e.ends_at, e.modality, e.city, e.state,
            e.organizer AS event_organizer, owner.name AS owner_name, e.certificate_theme AS event_theme,
            COALESCE(owner.signature_name, owner.name) AS owner_signature
     FROM certificates c JOIN users u ON u.id = c.user_id LEFT JOIN events e ON e.id = c.event_id
     LEFT JOIN users owner ON owner.id = e.owner_id WHERE c.verification_code = ?`
  ).get(code.toUpperCase())) as Row | undefined;
  if (!r) return undefined;
  return {
    id: r.id, user_id: r.user_id, owner_id: r.owner_id ?? null,
    revoked_at: r.revoked_at ?? null, revoked_by: r.revoked_by ?? null, revoke_reason: r.revoke_reason ?? null,
    title: r.title, verification_code: r.verification_code, issued_at: r.issued_at, recipient_name: r.recipient_name,
    starts_at: r.starts_at, modality: r.modality ?? null, city: r.city ?? null, state: r.state ?? null,
    workload_minutes: r.workload_minutes ?? (r.starts_at && r.ends_at ? workloadMinutes(r.starts_at, r.ends_at) : null),
    organizer_name: r.organizer_name || r.event_organizer || r.owner_name || null,
    responsible_name: r.responsible_name || r.owner_name || null,
    responsible_signature: (r.responsible_signature ?? r.owner_signature) || null,
    theme: r.theme || r.event_theme || null,
  };
}

export async function recordCertificateHistory(certificateId: number, action: HistoryAction, actorId: number | null, byAdmin = false, reason: string | null = null) {
  await getDb().prepare("INSERT INTO certificate_history (certificate_id, action, actor_id, by_admin, reason) VALUES (?,?,?,?,?)")
    .run(certificateId, action, actorId, byAdmin ? 1 : 0, reason);
}

export type CertificateItem = {
  id: number; verification_code: string; title: string; issued_at: string; recipient_name: string; event_id: number | null;
  workload_minutes: number | null; organizer_name: string | null; revoked_at: string | null; revoked_by: number | null; revoke_reason: string | null;
};

type ItemRow = Omit<CertificateItem, "workload_minutes" | "organizer_name"> & {
  workload_minutes: number | null; organizer_name: string | null; starts_at: string | null; ends_at: string | null; event_organizer: string | null; owner_name: string | null;
};

const ITEM_SQL = `SELECT c.id, c.verification_code, c.title, c.issued_at, u.name AS recipient_name, c.event_id, c.workload_minutes, c.organizer_name,
    c.revoked_at, c.revoked_by, c.revoke_reason, e.starts_at, e.ends_at, e.organizer AS event_organizer, owner.name AS owner_name
  FROM certificates c JOIN users u ON u.id = c.user_id LEFT JOIN events e ON e.id = c.event_id LEFT JOIN users owner ON owner.id = e.owner_id`;

function toItem(r: ItemRow): CertificateItem {
  return {
    id: r.id, verification_code: r.verification_code, title: r.title, issued_at: r.issued_at, recipient_name: r.recipient_name, event_id: r.event_id ?? null,
    workload_minutes: r.workload_minutes ?? (r.starts_at && r.ends_at ? workloadMinutes(r.starts_at, r.ends_at) : null),
    organizer_name: r.organizer_name || r.event_organizer || r.owner_name || null,
    revoked_at: r.revoked_at ?? null, revoked_by: r.revoked_by ?? null, revoke_reason: r.revoke_reason ?? null,
  };
}

/** Todos os certificados recebidos pela pessoa, inclusive os revogados e os de eventos excluidos. */
export async function receivedCertificates(userId: number): Promise<CertificateItem[]> {
  const rows = (await getDb().prepare(`${ITEM_SQL} WHERE c.user_id = ? ORDER BY c.issued_at DESC, c.id DESC`).all(userId)) as unknown as ItemRow[];
  return rows.map(toItem);
}

export type IssuedFilters = { q: string; event: number; status: "" | "valid" | "revoked" };

/** Certificados dos eventos cadastrados pela pessoa, com busca por participante ou codigo, evento e situacao. */
export async function issuedCertificates(ownerId: number, f: IssuedFilters): Promise<CertificateItem[]> {
  const where = ["e.owner_id = ?"];
  const args: (string | number)[] = [ownerId];
  if (f.q.trim()) {
    const term = `%${f.q.trim().toLowerCase()}%`;
    where.push("(LOWER(u.name) LIKE ? OR LOWER(c.verification_code) LIKE ?)");
    args.push(term, term);
  }
  if (f.event) { where.push("c.event_id = ?"); args.push(f.event); }
  if (f.status === "valid") where.push("c.revoked_at IS NULL");
  if (f.status === "revoked") where.push("c.revoked_at IS NOT NULL");
  const rows = (await getDb().prepare(`${ITEM_SQL} WHERE ${where.join(" AND ")} ORDER BY e.starts_at DESC, u.name, c.id LIMIT 500`).all(...args)) as unknown as ItemRow[];
  return rows.map(toItem);
}

/** Eventos da pessoa que ja tem certificados, para o filtro. */
export async function issuedCertificateEvents(ownerId: number): Promise<{ id: number; title: string }[]> {
  return (await getDb().prepare(
    `SELECT e.id, e.title FROM events e WHERE e.owner_id = ? AND EXISTS (SELECT 1 FROM certificates c WHERE c.event_id = e.id) ORDER BY e.starts_at DESC`
  ).all(ownerId)) as unknown as { id: number; title: string }[];
}

/** Linha do tempo de cada certificado, em ordem cronologica. */
export async function certificateTimeline(ids: number[]): Promise<Map<number, HistoryEntry[]>> {
  const map = new Map<number, HistoryEntry[]>();
  if (ids.length === 0) return map;
  const rows = (await getDb().prepare(
    `SELECT h.certificate_id, h.action, h.by_admin, h.reason, h.created_at, u.name AS actor_name
     FROM certificate_history h LEFT JOIN users u ON u.id = h.actor_id
     WHERE h.certificate_id IN (${ids.map(() => "?").join(",")}) ORDER BY h.created_at, h.id`
  ).all(...ids)) as unknown as HistoryEntry[];
  for (const r of rows) map.set(r.certificate_id, [...(map.get(r.certificate_id) ?? []), r]);
  return map;
}
