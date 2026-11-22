import { after } from "next/server";
import { headers } from "next/headers";
import { getDb } from "./db";

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

async function siteUrl(): Promise<string> {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function inviteEmailHtml(name: string, text: string, button: string, link: string): string {
  return `<div style="background:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0c1720">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:20px;font-weight:bold">Ponte</p>
      <p style="margin:0 0 12px;font-size:16px">Ola, ${esc(name)}!</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.5">${esc(text)}</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 24px"><tr><td style="border-radius:8px;background:#3d5afe">
        <a href="${esc(link)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${esc(button)}</a>
      </td></tr></table>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#55606a">Voce recebeu este e-mail porque tem uma conta na Ponte. Para responder, entre no site e escolha aceitar ou recusar.</p>
    </td></tr>
  </table>
</div>`;
}

/** Envia um e-mail de aviso ao usuario (via Resend) sem atrasar a resposta. Sem RESEND_API_KEY, nao faz nada. */
export async function emailUser(userId: number, subject: string, text: string, button: string, path: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  const u = (await getDb().prepare("SELECT name, email FROM users WHERE id = ?").get(userId)) as { name: string; email: string } | undefined;
  if (!u?.email) return;
  const link = `${await siteUrl()}${path}`;
  after(async () => {
    try {
      const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Ponte <onboarding@resend.dev>",
          to: [u.email],
          subject: `Ponte: ${subject}`.slice(0, 150),
          html: inviteEmailHtml(u.name, text, button, link),
          text: `Ola, ${u.name}!\n\n${text}\n\n${button}: ${link}`,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.warn(`[email-usuario] Resend respondeu ${res.status}`);
    } catch (e) {
      console.warn("[email-usuario] falha ao enviar:", (e as Error).message);
    }
  });
}
