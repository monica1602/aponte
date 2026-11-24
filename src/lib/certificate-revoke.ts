export const REVOKE_REASONS = ["Emitido por engano", "Presenca nao confirmada", "Dados incorretos", "Outro"] as const;

/** Motivo gravado na revogacao: um item da lista e, opcionalmente, um texto (obrigatorio em "Outro"). */
export function revokeReason(reason: string, details: string): { reason: string } | { error: string } {
  const item = REVOKE_REASONS.find((r) => r === reason);
  if (!item) return { error: "Escolha o motivo da revogacao." };
  const text = details.trim().slice(0, 500);
  if (item === "Outro" && !text) return { error: "Em \"Outro\", descreva o motivo da revogacao." };
  return { reason: text ? `${item}: ${text}` : item };
}

export function revokedDate(at: string): string {
  return new Date(`${at.replace(" ", "T")}Z`).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
