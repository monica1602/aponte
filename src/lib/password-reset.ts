"use server";

import crypto from "node:crypto";
import { passwordProblem } from "./password-policy";
import { headers } from "next/headers";
import { getDb, hashPassword } from "./db";
import { createSession } from "./auth";
import { back, str } from "./session";
import { hashToken } from "./reset-token";

const TTL_MS = 1000 * 60 * 60; // 1 hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


async function siteUrl(): Promise<string> {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

function resetEmailHtml(name: string, link: string): string {
  return `<div style="background:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0c1720">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:20px;font-weight:bold">Ponte</p>
      <p style="margin:0 0 12px;font-size:16px">Ola, ${name}!</p>
      <p style="margin:0 0 12px;font-size:15px;line-height:1.5">Recebemos um pedido para alterar a senha da sua conta na Ponte.</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5"><strong>Foi voce?</strong> Confirme clicando no botao abaixo. Voce volta para o site e cria a nova senha.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td style="border-radius:8px;background:#3d5afe">
        <a href="${link}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">Sim, fui eu. Alterar minha senha</a>
      </td></tr></table>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.5;color:#55606a">O botao vale por 1 hora e so pode ser usado uma vez. Se ele nao funcionar, copie este endereco no navegador:<br><a href="${link}" style="color:#3d5afe;word-break:break-all">${link}</a></p>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#55606a"><strong>Nao foi voce?</strong> Ignore este e-mail. Sua senha atual continua valendo e ninguem consegue altera-la sem este link.</p>
    </td></tr>
  </table>
</div>`;
}

async function sendResetEmail(to: string, name: string, link: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[redefinir-senha] RESEND_API_KEY ausente; link para ${to}: ${link}`);
    return false;
  }
  const safeName = name.replace(/[<>&"]/g, "");
  const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "Ponte <onboarding@resend.dev>",
      to: [to],
      subject: "Ponte: confirme que foi voce para alterar sua senha",
      html: resetEmailHtml(safeName, link),
      text: `Ola, ${safeName}!\n\nRecebemos um pedido para alterar a senha da sua conta na Ponte. Se foi voce, confirme e crie a nova senha neste link (vale por 1 hora e so pode ser usado uma vez):\n${link}\n\nSe nao foi voce, ignore este e-mail: sua senha atual continua valendo.`,
    }),
  });
  if (!res.ok) console.error(`[redefinir-senha] Resend respondeu ${res.status}: ${await res.text()}`);
  return res.ok;
}

export async function requestPasswordReset(formData: FormData) {
  const email = str(formData, "email", 200).toLowerCase();
  if (!EMAIL_RE.test(email)) back("/esqueci-senha", "error", "Informe um email valido.");
  const user = (await getDb().prepare("SELECT id, name FROM users WHERE email = ?").get(email)) as
    | { id: number; name: string }
    | undefined;
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    await getDb().prepare("DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?").run(user.id, Date.now());
    await getDb()
      .prepare("INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?,?)")
      .run(user.id, hashToken(token), Date.now() + TTL_MS);
    await sendResetEmail(email, user.name, `${await siteUrl()}/redefinir-senha?token=${token}`);
  }
  // Same answer whether or not the email exists, so accounts can't be discovered.
  back("/esqueci-senha", "msg", "Se este email estiver cadastrado, enviamos um link para redefinir a senha. Confira a caixa de entrada e o spam.");
}

export async function resetPassword(formData: FormData) {
  const token = str(formData, "token", 200);
  const password = str(formData, "password", 200);
  const confirmation = str(formData, "confirmation", 200);
  const ret = `/redefinir-senha?token=${encodeURIComponent(token)}`;
  const weak = passwordProblem(password);
  if (weak) back(ret, "error", weak);
  if (password !== confirmation) back(ret, "error", "A confirmacao de senha nao confere.");
  const row = (await getDb()
    .prepare("SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .get(hashToken(token), Date.now())) as { id: number; user_id: number } | undefined;
  if (!row) back("/esqueci-senha", "error", "Este link expirou ou ja foi usado. Peca um novo.");
  await getDb().prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(password), row!.user_id);
  await getDb().prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(row!.id);
  await getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(row!.user_id);
  await createSession(row!.user_id);
  back("/dashboard", "msg", "Senha redefinida. Voce ja esta conectado(a).");
}
