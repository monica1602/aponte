import { getDb } from "./db";

export const REPORT_REASONS = {
  assedio: "Assedio",
  discriminacao: "Discriminacao ou discurso de odio",
  ameaca: "Ameaca",
  dados_pessoais: "Exposicao de dados pessoais",
  spam: "Spam ou golpe",
  outro: "Outro",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export type ReportTarget = "user" | "message" | "project" | "event";
export const REPORT_TARGETS: Record<ReportTarget, string> = { user: "Pessoa", message: "Mensagem", project: "Projeto", event: "Evento" };
export const REPORT_DETAILS_MAX = 1000;
export const REPORT_LIMIT = { max: 10, windowMin: 24 * 60 };
export const REPORT_STATUS = { open: "Aberta", reviewing: "Em analise", closed: "Concluida" } as const;
export const REPORT_OUTCOMES = { archived: "Arquivada, sem medida", warned: "Advertencia", suspended: "Conta suspensa" } as const;
export type ReportOutcome = keyof typeof REPORT_OUTCOMES;

export function reportProblem(reason: string, details: string): string | null {
  if (!(reason in REPORT_REASONS)) return "Escolha o motivo da denuncia.";
  if (details.length > REPORT_DETAILS_MAX) return `A descricao pode ter ate ${REPORT_DETAILS_MAX} caracteres.`;
  if (reason === "outro" && !details) return "Em \"Outro\", descreva o que aconteceu.";
  return null;
}

/** Bloqueio em qualquer direcao impede mensagens, pedidos de contato e convites entre as duas pessoas. */
export async function blockedBetween(a: number, b: number): Promise<boolean> {
  return !!(await getDb().prepare(
    "SELECT 1 FROM user_blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)"
  ).get(a, b, b, a));
}

export async function hasBlocked(blocker: number, blocked: number): Promise<boolean> {
  return !!(await getDb().prepare("SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ?").get(blocker, blocked));
}

export async function listBlocked(userId: number) {
  return (await getDb().prepare(
    "SELECT u.id, u.name, b.created_at FROM user_blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY u.name"
  ).all(userId)) as unknown as { id: number; name: string; created_at: string }[];
}

export type ReportRow = {
  id: number; reporter_id: number | null; reporter_name: string | null; target_type: ReportTarget; target_id: number;
  target_user_id: number | null; target_user_name: string | null; target_user_status: string | null; target_label: string;
  message_body: string | null; reason: ReportReason; details: string; status: keyof typeof REPORT_STATUS;
  outcome: ReportOutcome | null; admin_note: string; created_at: string; closed_at: string | null; sensitive: number;
};

export async function listReports(status: string): Promise<ReportRow[]> {
  const where = status in REPORT_STATUS ? "WHERE r.status = ?" : "";
  return (await getDb().prepare(
    `SELECT r.*, a.name AS reporter_name, t.name AS target_user_name, t.account_status AS target_user_status
     FROM reports r LEFT JOIN users a ON a.id = r.reporter_id LEFT JOIN users t ON t.id = r.target_user_id
     ${where} ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.sensitive DESC, r.created_at DESC, r.id DESC LIMIT 300`
  ).all(...(where ? [status] : []))) as unknown as ReportRow[];
}
