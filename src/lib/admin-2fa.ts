import { getDb } from "./db";
import { hashToken } from "./reset-token";
import { matchTotp, newRecoveryCodes, newTotpSecret, normalizeRecoveryCode } from "./totp";

type Row = { id: number; secret: string; enabled_at: string | null; last_step: number };

export function twoFactorResetOn(): boolean {
  return process.env.ADMIN_2FA_RESET === "1";
}

export async function activeTwoFactor(): Promise<Row | null> {
  const row = (await getDb()
    .prepare("SELECT id, secret, enabled_at, last_step FROM admin_2fa WHERE enabled_at IS NOT NULL AND disabled_at IS NULL ORDER BY id DESC LIMIT 1")
    .get()) as Row | undefined;
  return row ?? null;
}

export async function pendingTwoFactor(): Promise<Row> {
  const db = getDb();
  const row = (await db
    .prepare("SELECT id, secret, enabled_at, last_step FROM admin_2fa WHERE enabled_at IS NULL AND disabled_at IS NULL ORDER BY id DESC LIMIT 1")
    .get()) as Row | undefined;
  if (row) return row;
  await db.prepare("INSERT INTO admin_2fa (secret) VALUES (?)").run(newTotpSecret());
  return pendingTwoFactor();
}

/** Disables the active configuration (kept in the table with disabled_at). */
export async function disableTwoFactor(): Promise<void> {
  const db = getDb();
  await db.prepare("UPDATE admin_2fa SET disabled_at = datetime('now') WHERE disabled_at IS NULL").run();
  await db.prepare("UPDATE admin_recovery_codes SET used_at = datetime('now') WHERE used_at IS NULL").run();
}

/** Confirms the pending secret with a code from the app; returns the recovery codes, or null when the code is wrong. */
export async function enableTwoFactor(code: string): Promise<string[] | null> {
  const db = getDb();
  const row = await pendingTwoFactor();
  const step = matchTotp(row.secret, code, 0);
  if (!step) return null;
  await disableTwoFactor();
  await db.prepare("UPDATE admin_2fa SET enabled_at = datetime('now'), disabled_at = NULL, last_step = ? WHERE id = ?").run(step, row.id);
  const codes = newRecoveryCodes();
  for (const c of codes) {
    await db.prepare("INSERT INTO admin_recovery_codes (code_hash) VALUES (?)").run(hashToken(normalizeRecoveryCode(c)));
  }
  return codes;
}

/** Checks an app code (once per 30s step) or an unused recovery code. */
export async function checkSecondFactor(code: string): Promise<"app" | "recovery" | null> {
  const db = getDb();
  const row = await activeTwoFactor();
  if (!row) return null;
  const clean = code.replace(/\s/g, "");
  const step = matchTotp(row.secret, clean, Number(row.last_step));
  if (step) {
    const res = await db.prepare("UPDATE admin_2fa SET last_step = ? WHERE id = ? AND last_step < ?").run(step, row.id, step);
    return Number(res.changes) > 0 ? "app" : null;
  }
  const norm = normalizeRecoveryCode(clean);
  if (norm.length !== 8) return null;
  const res = await db
    .prepare("UPDATE admin_recovery_codes SET used_at = datetime('now') WHERE code_hash = ? AND used_at IS NULL")
    .run(hashToken(norm));
  return Number(res.changes) > 0 ? "recovery" : null;
}

export async function recoveryCodesLeft(): Promise<number> {
  const row = (await getDb().prepare("SELECT COUNT(*) AS n FROM admin_recovery_codes WHERE used_at IS NULL").get()) as { n: number };
  return Number(row.n);
}
