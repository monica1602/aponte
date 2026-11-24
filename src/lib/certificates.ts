import { getDb } from "./db";
import { eventTimeMs } from "./event-time";
import type { CertificateData } from "./certificate-pdf";

type Row = Omit<CertificateData, "workload_minutes" | "organizer_name" | "responsible_name" | "theme"> & {
  workload_minutes: number | null; organizer_name: string | null; responsible_name: string | null; theme: string | null;
  ends_at: string | null; event_organizer: string | null; owner_name: string | null; event_theme: string | null;
};

export function workloadMinutes(startsAt: string, endsAt: string): number | null {
  const minutes = Math.round((eventTimeMs(endsAt) - eventTimeMs(startsAt)) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/** Dados do certificado: os gravados na emissao e, nos certificados antigos, os dados atuais do evento. */
export async function loadCertificate(code: string): Promise<CertificateData | undefined> {
  const r = (await getDb().prepare(
    `SELECT c.title, c.verification_code, c.issued_at, c.workload_minutes, c.organizer_name, c.responsible_name, c.theme,
            u.name AS recipient_name, e.starts_at, e.ends_at, e.modality, e.city, e.state,
            e.organizer AS event_organizer, owner.name AS owner_name, e.certificate_theme AS event_theme
     FROM certificates c JOIN users u ON u.id = c.user_id LEFT JOIN events e ON e.id = c.event_id
     LEFT JOIN users owner ON owner.id = e.owner_id WHERE c.verification_code = ?`
  ).get(code.toUpperCase())) as Row | undefined;
  if (!r) return undefined;
  return {
    title: r.title, verification_code: r.verification_code, issued_at: r.issued_at, recipient_name: r.recipient_name,
    starts_at: r.starts_at, modality: r.modality ?? null, city: r.city ?? null, state: r.state ?? null,
    workload_minutes: r.workload_minutes ?? (r.starts_at && r.ends_at ? workloadMinutes(r.starts_at, r.ends_at) : null),
    organizer_name: r.organizer_name || r.event_organizer || r.owner_name || null,
    responsible_name: r.responsible_name || r.owner_name || null,
    theme: r.theme || r.event_theme || null,
  };
}
