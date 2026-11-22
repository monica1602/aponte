import crypto from "node:crypto";
import { getDb } from "./db";

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function resetTokenUser(token: string): Promise<{ name: string } | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = (await getDb()
    .prepare(
      `SELECT u.name FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = ? AND r.used_at IS NULL AND r.expires_at > ?`
    )
    .get(hashToken(token), Date.now())) as { name: string } | undefined;
  return row ?? null;
}
