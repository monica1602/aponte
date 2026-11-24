import { getDb } from "./db";

/** essential: sempre enviado. network e reminders: a pessoa pode desligar em Meus dados. */
export type EmailKind = "essential" | "network" | "reminders";
const PREF_COLUMN: Record<Exclude<EmailKind, "essential">, string> = { network: "email_network", reminders: "email_reminders" };

export const MANAGE_EMAILS_PATH = `/login?next=${encodeURIComponent("/meus-dados#comunicacoes")}`;

/** Respeita a preferencia da pessoa; e-mails essenciais sempre saem. */
export async function wantsEmail(userId: number, kind: EmailKind): Promise<boolean> {
  if (kind === "essential") return true;
  const row = (await getDb().prepare(`SELECT ${PREF_COLUMN[kind]} AS v FROM users WHERE id = ?`).get(userId)) as { v: number } | undefined;
  return Boolean(row && Number(row.v));
}
