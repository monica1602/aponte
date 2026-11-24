import { log, errorFields } from "./log";
import crypto from "node:crypto";
import { getDb } from "./db";
import { hashToken } from "./reset-token";

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;

export type VerificationTarget = { user_id: number; name: string; role: string; created_at: string; expired: boolean };

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Creates a new single-use link for the account, replacing older unused links. Only the hash is stored. */
export async function createVerificationToken(userId: number): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const db = getDb();
  await db.prepare("DELETE FROM email_verifications WHERE user_id = ? AND used_at IS NULL").run(userId);
  await db
    .prepare("INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES (?,?,?)")
    .run(userId, hashToken(token), Date.now() + VERIFY_TTL_MS);
  return token;
}

/** The pending account a link belongs to, or null when the link is invalid, already used or the e-mail is no longer pending. */
export async function verificationTarget(token: string, now = Date.now()): Promise<VerificationTarget | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = (await getDb()
    .prepare(
      `SELECT u.id AS user_id, u.name, u.role, u.created_at, v.expires_at FROM email_verifications v
       JOIN users u ON u.id = v.user_id
       WHERE v.token_hash = ? AND v.used_at IS NULL AND u.email_status = 'pending'`
    )
    .get(hashToken(token))) as { user_id: number; name: string; role: string; created_at: string; expires_at: number } | undefined;
  if (!row) return null;
  return { user_id: Number(row.user_id), name: row.name, role: row.role, created_at: String(row.created_at), expired: Number(row.expires_at) <= now };
}

export async function markVerificationUsed(token: string): Promise<void> {
  await getDb().prepare("UPDATE email_verifications SET used_at = datetime('now') WHERE token_hash = ?").run(hashToken(token));
}

export function verificationEmailHtml(name: string, roleLabel: string, date: string, yes: string, no: string): string {
  return `<div style="background:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0c1720">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:20px;font-weight:bold">Ponte</p>
      <p style="margin:0 0 12px;font-size:16px">Ola, ${esc(name)}!</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5">Uma conta de <strong>${esc(roleLabel)}</strong> foi criada na Ponte com este e-mail em ${esc(date)}.</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5"><strong>Foi voce?</strong> Confirme clicando no botao abaixo.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td style="border-radius:8px;background:#3d5afe">
        <a href="${esc(yes)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">Sim, fui eu. Confirmar meu e-mail</a>
      </td></tr></table>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5"><strong>Nao foi voce?</strong> <a href="${esc(no)}" style="color:#3d5afe">Clique aqui para desativar a conta</a>. Nenhum dado seu e usado.</p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#55606a">O link vale por 24 horas e so pode ser usado uma vez. Se o botao nao funcionar, copie este endereco no navegador:<br><a href="${esc(yes)}" style="color:#3d5afe;word-break:break-all">${esc(yes)}</a></p>
    </td></tr>
  </table>
</div>`;
}

export async function sendVerificationEmail(
  to: string, name: string, roleLabel: string, date: string, base: string, token: string
): Promise<boolean> {
  const yes = `${base}/verificar-email?token=${token}`;
  const no = `${yes}&r=nao`;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    log("warn", "verificar-email", `RESEND_API_KEY ausente; link para ${to}: ${yes}`);
    return false;
  }
  const safeName = name.replace(/[<>&"]/g, "");
  try {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Ponte <onboarding@resend.dev>",
        to: [to],
        subject: "Ponte: foi voce que criou esta conta?",
        html: verificationEmailHtml(safeName, roleLabel, date, yes, no),
        text: `Ola, ${safeName}!\n\nUma conta de ${roleLabel} foi criada na Ponte com este e-mail em ${date}.\n\nFoi voce? Confirme seu e-mail neste link (vale por 24 horas e so pode ser usado uma vez):\n${yes}\n\nNao foi voce? Desative a conta neste link:\n${no}`,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) log("error", "verificar-email", `Resend respondeu ${res.status}: ${await res.text()}`);
    return res.ok;
  } catch (e) {
    log("warn", "verificar-email", "Falha ao enviar.", errorFields(e));
    return false;
  }
}
