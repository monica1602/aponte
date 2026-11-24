import { getDb } from "./db";

export type ConsentKind =
  | "public_profile" | "image" | "event_privacy" | "event_communications" | "event_image"
  | "email_network" | "email_reminders" | "news";

export const CONSENT_PT: Record<ConsentKind, string> = {
  public_profile: "Perfil publico",
  image: "Uso de imagem",
  event_privacy: "Aviso de privacidade do evento",
  event_communications: "Comunicacoes do evento",
  event_image: "Imagem no evento",
  email_network: "E-mails de avisos da rede",
  email_reminders: "E-mails de lembretes de eventos",
  news: "Novidades da Ponte",
};

export const CONSENT_SOURCE_PT: Record<string, string> = {
  cadastro: "Cadastro",
  google: "Cadastro com Google",
  primeiro_acesso: "Primeiro acesso",
  perfil: "Perfil",
  inscricao_evento: "Inscricao no evento",
  evento: "Pagina do evento",
  meus_dados: "Meus dados",
  anterior: "Anterior ao registro",
};

/** Cada concessao ou revogacao e uma linha nova, nunca alterada. */
export async function recordConsent(
  userId: number,
  consent: ConsentKind,
  granted: boolean,
  source: keyof typeof CONSENT_SOURCE_PT,
  eventId: number | null = null
) {
  await getDb()
    .prepare("INSERT INTO consent_events (user_id, consent, event_id, granted, source) VALUES (?,?,?,?,?)")
    .run(userId, consent, eventId, granted ? 1 : 0, source);
}

/** Grava so o que mudou entre o estado anterior e o novo. */
export async function recordConsentChanges(
  userId: number,
  changes: [ConsentKind, boolean, boolean][],
  source: keyof typeof CONSENT_SOURCE_PT,
  eventId: number | null = null
) {
  for (const [consent, before, after] of changes) {
    if (before !== after) await recordConsent(userId, consent, after, source, eventId);
  }
}

export async function consentHistory(userId: number) {
  return (await getDb()
    .prepare(
      `SELECT c.consent, c.granted, c.source, c.created_at, c.event_id, e.title AS event_title
       FROM consent_events c LEFT JOIN events e ON e.id = c.event_id
       WHERE c.user_id = ? ORDER BY c.created_at DESC, c.id DESC`
    )
    .all(userId)) as {
    consent: ConsentKind;
    granted: number;
    source: string;
    created_at: string;
    event_id: number | null;
    event_title: string | null;
  }[];
}
