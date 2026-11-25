import { mailConfigured, sendMail } from "./mail";
import { log, errorFields } from "./log";
import { after } from "next/server";
import { headers } from "next/headers";
import { siteUrlFrom } from "./environment";
import { sendWhatsApp, whatsappConfig } from "./whatsapp";

export const ROLE_PT: Record<string, string> = { mentor: "mentor", mentee: "mentorado", company: "empresa" };

async function adminUrl(): Promise<string> {
  const h = await headers();
  return `${siteUrlFrom((name) => h.get(name))}/admin`;
}

async function sendAdminEmail(to: string, text: string, link: string): Promise<void> {
  if (!mailConfigured()) return;
  const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const res = await sendMail({
    to,
    subject: `Ponte: ${text}`.slice(0, 150),
    html: `<p>${esc(text)}</p><p><a href="${esc(link)}">Abrir a administracao</a></p>`,
  });
  if (!res.ok) log("warn", "aviso-admin", `${res.provider} respondeu ${res.status}`);
}

/** Envia o aviso agora (WhatsApp e/ou e-mail) e espera terminar. Nunca lanca erro. */
export async function sendAdminAlert(text: string, link: string): Promise<boolean> {
  const wa = whatsappConfig();
  const email = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  const jobs: Promise<unknown>[] = [];
  if (wa) jobs.push(sendWhatsApp(wa, `Ponte: ${text}\nVer: ${link}`));
  if (email && mailConfigured()) jobs.push(sendAdminEmail(email, text, link));
  for (const r of await Promise.allSettled(jobs)) {
    if (r.status === "rejected") log("warn", "aviso-admin", "Falha ao enviar.", errorFields(r.reason));
  }
  return jobs.length > 0;
}

/** Avisa o administrador (WhatsApp e/ou e-mail) sem atrasar a resposta. Envia so nomes, nunca e-mails ou dados pessoais. */
export async function alertAdmin(text: string): Promise<void> {
  const wa = whatsappConfig();
  const email = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  if (!wa && !(email && mailConfigured())) return;
  const link = await adminUrl();
  after(() => sendAdminAlert(text, link).then(() => undefined));
}
