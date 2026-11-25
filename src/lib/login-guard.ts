import { getDb } from "./db";
import type { Limit } from "./rate-limit";

const WINDOW_MIN = 15;
const PAIR_MAX = 5;
const OWNER_WARNING_EVERY_MS = 24 * 60 * 60_000;

/** Limites do login: o mesmo IP com o mesmo e-mail, o e-mail vindo de qualquer IP e o IP com qualquer e-mail. */
export function loginLimits(email: string, ip: string): { pair: Limit; email: Limit; ip: Limit } {
  return {
    pair: { action: "login", subject: `pair:${email}|${ip}`, max: PAIR_MAX, windowMin: WINDOW_MIN },
    email: { action: "login", subject: `email:${email}`, max: 30, windowMin: 60 },
    ip: { action: "login", subject: `ip:${ip}`, max: 30, windowMin: WINDOW_MIN },
  };
}

/** Cada erro do mesmo IP com o mesmo e-mail dobra a espera: 2, 4, 8 e 16 segundos. Devolve os segundos que faltam. */
export function secondsToWait(times: number[], now = Date.now()): number {
  const recent = times.filter((t) => t > now - WINDOW_MIN * 60_000);
  if (recent.length === 0 || recent.length >= PAIR_MAX) return 0;
  const last = Math.max(...recent);
  const left = 2 ** recent.length * 1000 - (now - last);
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

export async function progressiveWait(pair: Limit, now = Date.now()): Promise<number> {
  const rows = (await getDb()
    .prepare("SELECT attempted_at FROM auth_attempts WHERE action = ? AND subject = ? AND attempted_at > ?")
    .all(pair.action, pair.subject, now - WINDOW_MIN * 60_000)) as { attempted_at: number | string }[];
  return secondsToWait(rows.map((r) => Number(r.attempted_at)), now);
}

export function waitSecondsMessage(seconds: number): string {
  return `Senha incorreta ha pouco. Aguarde ${seconds} segundo${seconds > 1 ? "s" : ""} e tente de novo.`;
}

/** Libera o login do e-mail em todos os IPs (login certo ou senha redefinida). */
export async function clearLoginAttempts(email: string): Promise<void> {
  const db = getDb();
  const rows = (await db.prepare("SELECT DISTINCT subject FROM auth_attempts WHERE action = 'login'").all()) as { subject: string }[];
  const subjects = rows.map((r) => r.subject).filter((s) => s === `email:${email}` || s.startsWith(`pair:${email}|`));
  for (const s of subjects) await db.prepare("DELETE FROM auth_attempts WHERE action = 'login' AND subject = ?").run(s);
}

/** True no maximo 1 vez a cada 24 horas por e-mail: so entao o dono recebe o aviso de tentativas erradas. */
export async function claimOwnerWarning(email: string, now = Date.now()): Promise<boolean> {
  const db = getDb();
  const subject = `email:${email}`;
  const last = (await db
    .prepare("SELECT MAX(attempted_at) AS t FROM auth_attempts WHERE action = 'login_warning' AND subject = ?")
    .get(subject)) as { t: number | string | null } | undefined;
  if (Number(last?.t ?? 0) > now - OWNER_WARNING_EVERY_MS) return false;
  await db.prepare("INSERT INTO auth_attempts (action, subject, attempted_at) VALUES ('login_warning', ?, ?)").run(subject, now);
  return true;
}
