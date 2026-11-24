import { log, errorFields } from "./log";
import { after } from "next/server";
import { headers } from "next/headers";
import { getDb } from "./db";
import { MANAGE_EMAILS_PATH, wantsEmail, type EmailKind } from "./email-prefs";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function siteUrl(): Promise<string> {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function inviteEmailHtml(name: string, text: string, button: string, link: string, manageLink = ""): string {
  return `<div style="background:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0c1720">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:20px;font-weight:bold">Ponte</p>
      <p style="margin:0 0 12px;font-size:16px">Ola, ${esc(name)}!</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5">${esc(text)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td style="border-radius:8px;background:#3d5afe">
        <a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${esc(button)}</a>
      </td></tr></table>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#55606a">Voce recebeu este e-mail porque tem uma conta na Ponte. Para responder, entre no site e escolha aceitar ou recusar.${manageLink ? ` Para escolher quais e-mails voce recebe, use <a href="${esc(manageLink)}" style="color:#3d5afe">Gerenciar e-mails</a>.` : ""}</p>
    </td></tr>
  </table>
</div>`;
}

/** Envia um e-mail de aviso ao usuario (via Resend) sem atrasar a resposta. Sem RESEND_API_KEY, nao faz nada. */
export async function emailUser(userId: number, subject: string, text: string, button: string, path: string, kind: EmailKind): Promise<void> {
  if (!(await wantsEmail(userId, kind))) return;
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const u = (await getDb().prepare("SELECT name, email FROM users WHERE id = ?").get(userId)) as { name: string; email: string } | undefined;
  if (!u?.email) return;
  const base = await siteUrl();
  const link = `${base}${path}`;
  const manage = kind === "essential" ? "" : `${base}${MANAGE_EMAILS_PATH}`;
  after(async () => {
    try {
      const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Ponte <onboarding@resend.dev>",
          to: [u.email],
          subject: `Ponte: ${subject}`.slice(0, 150),
          html: inviteEmailHtml(u.name, text, button, link, manage),
          text: `Ola, ${u.name}!\n\n${text}\n\n${button}: ${link}${manage ? `\n\nGerenciar e-mails: ${manage}` : ""}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) log("warn", "email-usuario", `Resend respondeu ${res.status}`);
    } catch (e) {
      log("warn", "email-usuario", "Falha ao enviar.", errorFields(e));
    }
  });
}

