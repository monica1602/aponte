import { getDb } from "./db";

/** Campo escondido: pessoas nao veem nem preenchem; robos que preenchem tudo caem aqui. */
export const SIGNUP_TRAP_FIELD = "ponte_campo_extra";
export const SIGNUP_STARTED_FIELD = "form_started_at";
export const SIGNUP_MIN_MS = 3000;
export const SIGNUP_SITE_LIMIT = { action: "signup", subject: "site", max: 30, windowMin: 60 };
const ALERT_ACTION = "signup_alert";
const ALERT_EVERY_MS = 60 * 60_000;

export function signupStartedAt(): string {
  return String(Date.now());
}

/** Formulario enviado por robo: campo escondido preenchido, sem horario de abertura ou enviado rapido demais. */
export function looksLikeBot(formData: FormData, now = Date.now()): boolean {
  if (String(formData.get(SIGNUP_TRAP_FIELD) ?? "") !== "") return true;
  const started = Number(formData.get(SIGNUP_STARTED_FIELD));
  if (!Number.isFinite(started) || started <= 0) return true;
  return now - started < SIGNUP_MIN_MS;
}

/** Aviso de novo cadastro no maximo 1 vez por hora; o aviso conta os cadastros que ficaram sem aviso. Null = nao avisar agora. */
export async function signupAlertText(text: string, now = Date.now()): Promise<string | null> {
  const db = getDb();
  const last = (await db
    .prepare("SELECT MAX(attempted_at) AS t FROM auth_attempts WHERE action = ? AND subject = 'site'")
    .get(ALERT_ACTION)) as { t: number | string | null } | undefined;
  const lastAt = Number(last?.t ?? 0);
  if (lastAt > now - ALERT_EVERY_MS) return null;
  const row = (await db
    .prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE action = ? AND subject = ? AND attempted_at > ?")
    .get(SIGNUP_SITE_LIMIT.action, SIGNUP_SITE_LIMIT.subject, lastAt)) as { n: number | string };
  const others = Math.max(0, Number(row.n) - 1);
  await db.prepare("INSERT INTO auth_attempts (action, subject, attempted_at) VALUES (?, 'site', ?)").run(ALERT_ACTION, now);
  if (others === 0) return text;
  return `${text} (e mais ${others} cadastro${others > 1 ? "s" : ""} desde o ultimo aviso)`;
}
