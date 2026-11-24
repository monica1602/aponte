export type HistoryAction = "issued" | "self_issued" | "revoked" | "unrevoked";

export type HistoryEntry = {
  certificate_id: number; action: string; by_admin: number; reason: string | null; created_at: string; actor_name: string | null;
};

/** Texto de cada passo da linha do tempo do certificado. */
export function historyLabel(h: Pick<HistoryEntry, "action" | "by_admin" | "reason" | "actor_name">): string {
  const org = `pela organizacao${h.actor_name ? ` (${h.actor_name})` : ""}`;
  const who = h.by_admin ? "pela administracao" : org;
  if (h.action === "self_issued") return "Emitido pelo participante";
  if (h.action === "issued") return `Emitido ${org}`;
  if (h.action === "revoked") return `Revogado ${who}${h.reason ? `. Motivo: ${h.reason}` : ""}`;
  if (h.action === "unrevoked") return `Revogacao desfeita ${who}`;
  return h.action;
}

/** "AAAA-MM-DD HH:MM:SS" em UTC para data e hora de Brasilia. */
export function historyDate(at: string): string {
  return new Date(`${at.replace(" ", "T")}Z`).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}
