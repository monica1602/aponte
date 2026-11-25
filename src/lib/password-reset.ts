"use server";

import { mailConfigured, sendMail } from "./mail";
import { clearLoginAttempts } from "./login-guard";
import { log } from "./log";
import crypto from "node:crypto";
import { passwordProblem } from "./password-policy";
import { headers } from "next/headers";
import { siteUrlFrom } from "./environment";
import { getDb, hashPassword } from "./db";
import { createSession } from "./auth";
import { back, clientIp, str } from "./session";
import { hashToken } from "./reset-token";
import { blockedFor, recordAttempt, tooManyMessage } from "./rate-limit";

const TTL_MS = 1000 * 60 * 60; // 1 hour
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


async function siteUrl(): Promise<string> {
  const h = await headers();
  return siteUrlFrom((name) => h.get(name));
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
  if (!mailConfigured()) {
    log("warn", "redefinir-senha", `Envio de e-mail nao configurado; link para ${to}: ${link}`);
    return false;
  }
  const safeName = name.replace(/[<>&"]/g, "");
  const res = await sendMail({
      to,
      subject: "Ponte: confirme que foi voce para alterar sua senha",
      html: resetEmailHtml(safeName, link),
      text: `Ola, ${safeName}!\n\nRecebemos um pedido para alterar a senha da sua conta na Ponte. Se foi voce, confirme e crie a nova senha neste link (vale por 1 hora e so pode ser usado uma vez):\n${link}\n\nSe nao foi voce, ignore este e-mail: sua senha atual continua valendo.`,
  });
  if (!res.ok) log("error", "redefinir-senha", `${res.provider} respondeu ${res.status}: ${await res.detail()}`);
  return res.ok;
}

export async function requestPasswordReset(formData: FormData) {
  const email = str(formData, "email", 200).toLowerCase();
  if (!EMAIL_RE.test(email)) back("/esqueci-senha", "error", "Informe um email valido.");
  const ip = await clientIp();
  const wait = await blockedFor([
    { action: "reset_request", subject: `email:${email}`, max: 3, windowMin: 60 },
    { action: "reset_request", subject: `ip:${ip}`, max: 10, windowMin: 60 },
  ]);
  if (wait) back("/esqueci-senha", "error", tooManyMessage(wait));
  await recordAttempt("reset_request", [`email:${email}`, `ip:${ip}`]);
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
  const ip = await clientIp();
  const tokenLimit = [{ action: "reset_token", subject: `ip:${ip}`, max: 10, windowMin: 15 }];
  const wait = await blockedFor(tokenLimit);
  if (wait) back(ret, "error", tooManyMessage(wait));
  const weak = passwordProblem(password);
  if (weak) back(ret, "error", weak);
  if (password !== confirmation) back(ret, "error", "A confirmacao de senha nao confere.");
  const row = (await getDb()
    .prepare("SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")
    .get(hashToken(token), Date.now())) as { id: number; user_id: number } | undefined;
  if (!row) {
    await recordAttempt("reset_token", [`ip:${ip}`]);
    back("/esqueci-senha", "error", "Este link expirou ou ja foi usado. Peca um novo.");
  }
  await getDb().prepare("UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?").run(hashPassword(password), row!.user_id);
  await getDb().prepare("UPDATE password_resets SET used_at = datetime('now') WHERE id = ?").run(row!.id);
  await getDb().prepare("DELETE FROM sessions WHERE user_id = ?").run(row!.user_id);
  const owner = (await getDb().prepare("SELECT email FROM users WHERE id = ?").get(row!.user_id)) as { email: string } | undefined;
  if (owner) await clearLoginAttempts(owner.email);
  await createSession(row!.user_id);
  back("/dashboard", "msg", "Senha redefinida. Voce ja esta conectado(a).");
}
