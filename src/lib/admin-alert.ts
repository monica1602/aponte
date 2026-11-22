import { after } from "next/server";
import { headers } from "next/headers";
import { sendWhatsApp, whatsappConfig } from "./whatsapp";

export const ROLE_PT: Record<string, string> = { mentor: "mentor", mentee: "mentorado", company: "empresa" };

async function adminUrl(): Promise<string> {
  if (process.env.BASE_URL) return `${process.env.BASE_URL.replace(/\/$/, "")}/admin`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/admin`;
}

/** Avisa o administrador no WhatsApp sem atrasar a resposta. Envia so nomes, nunca e-mails ou dados pessoais. */
export async function alertAdmin(text: string): Promise<void> {
  const cfg = whatsappConfig();
  if (!cfg) return;
  const message = `Ponte: ${text}\nVer: ${await adminUrl()}`;
  after(async () => {
    try {
      await sendWhatsApp(cfg, message);
    } catch (e) {
      console.warn("[whatsapp] falha ao enviar aviso:", (e as Error).message);
    }
  });
}
