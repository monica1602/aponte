import crypto from "node:crypto";
import { getDb } from "./db";

export const ADMIN_SESSION_MAX_MS = 8 * 60 * 60 * 1000;
export const ADMIN_SESSION_IDLE_MS = 60 * 60 * 1000;
const TOUCH_MS = 60 * 1000;

const hash = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

/** Ties the session to the current ADMIN_PASSWORD: changing it on Vercel ends every session. */
function passwordTag(): string {
  return crypto.createHmac("sha256", process.env.ADMIN_PASSWORD ?? "").update("admin-session").digest("hex");
}

export async function openAdminSession(now = Date.now()): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const db = getDb();
  await db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ? OR idle_expires_at <= ?").run(now, now);
  await db
    .prepare("INSERT INTO admin_sessions (token_hash, password_tag, idle_expires_at, expires_at) VALUES (?,?,?,?)")
    .run(hash(token), passwordTag(), now + ADMIN_SESSION_IDLE_MS, now + ADMIN_SESSION_MAX_MS);
  return token;
}

/** Valid while used at least once per hour, for at most 8 hours after the login. */
export async function checkAdminSession(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token || !process.env.ADMIN_PASSWORD) return false;
  const db = getDb();
  const row = (await db
    .prepare("SELECT password_tag, idle_expires_at, expires_at FROM admin_sessions WHERE token_hash = ?")
    .get(hash(token))) as { password_tag: string; idle_expires_at: number; expires_at: number } | undefined;
  if (!row || Number(row.expires_at) <= now || Number(row.idle_expires_at) <= now) return false;
  const tag = passwordTag();
  if (row.password_tag.length !== tag.length || !crypto.timingSafeEqual(Buffer.from(row.password_tag), Buffer.from(tag))) return false;
  if (Number(row.idle_expires_at) - now < ADMIN_SESSION_IDLE_MS - TOUCH_MS) {
    await db.prepare("UPDATE admin_sessions SET idle_expires_at = ? WHERE token_hash = ?").run(now + ADMIN_SESSION_IDLE_MS, hash(token));
  }
  return true;
}

export async function closeAdminSession(token: string | undefined): Promise<void> {
  if (token) await getDb().prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(hash(token));
}

export async function closeAllAdminSessions(): Promise<number> {
  const res = await getDb().prepare("DELETE FROM admin_sessions").run();
  return Number(res.changes);
}
