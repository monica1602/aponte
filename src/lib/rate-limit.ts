import { getDb } from "./db";

export type Limit = { action: string; subject: string; max: number; windowMin: number };

const KEEP_MS = 24 * 60 * 60_000;

/** Minutes until the attempts in the window drop below `max`, or 0 when not blocked. */
export function minutesLeft(times: number[], max: number, windowMin: number, now = Date.now()): number {
  const windowMs = windowMin * 60_000;
  const recent = times.filter((t) => t > now - windowMs).sort((a, b) => a - b);
  if (recent.length < max) return 0;
  return Math.max(1, Math.ceil((recent[recent.length - max] + windowMs - now) / 60_000));
}

export async function blockedFor(limits: Limit[]): Promise<number> {
  const now = Date.now();
  let wait = 0;
  for (const l of limits) {
    const rows = (await getDb()
      .prepare("SELECT attempted_at FROM auth_attempts WHERE action = ? AND subject = ? AND attempted_at > ?")
      .all(l.action, l.subject, now - l.windowMin * 60_000)) as { attempted_at: number }[];
    wait = Math.max(wait, minutesLeft(rows.map((r) => Number(r.attempted_at)), l.max, l.windowMin, now));
  }
  return wait;
}

export async function recordAttempt(action: string, subjects: string[]): Promise<void> {
  const now = Date.now();
  const db = getDb();
  await db.prepare("DELETE FROM auth_attempts WHERE attempted_at < ?").run(now - KEEP_MS);
  for (const s of subjects) {
    await db.prepare("INSERT INTO auth_attempts (action, subject, attempted_at) VALUES (?,?,?)").run(action, s, now);
  }
}

export async function clearAttempts(action: string, subject: string): Promise<void> {
  await getDb().prepare("DELETE FROM auth_attempts WHERE action = ? AND subject = ?").run(action, subject);
}

export function tooManyMessage(minutes: number): string {
  return `Muitas tentativas. Aguarde ${minutes} minuto${minutes > 1 ? "s" : ""} e tente de novo.`;
}
