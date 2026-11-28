"use server";

import { CONTACT_LIMIT, CONTACT_MAX, contactMail, contactProblem, type ContactFields, type ContactState } from "./contact";
import { log } from "./log";
import { mailConfigured, sendMail } from "./mail";
import { blockedFor, recordAttempt } from "./rate-limit";
import { clientIp } from "./session";

const field = (formData: FormData, key: string, max: number) => String(formData.get(key) ?? "").trim().slice(0, max + 1);

export async function sendContactMessage(_prev: ContactState, formData: FormData): Promise<ContactState> {
  const fields: ContactFields = {
    name: field(formData, "name", CONTACT_MAX.name),
    email: field(formData, "email", CONTACT_MAX.email).toLowerCase(),
    type: field(formData, "type", 50),
    message: field(formData, "message", CONTACT_MAX.message),
  };
  // Campo invisivel: so robos preenchem. Responde como sucesso, sem enviar nada.
  if (field(formData, "website", 200)) return { ok: true };
  const problem = contactProblem(fields);
  if (problem) return { error: problem, fields };
  const ip = await clientIp();
  const limit = { action: "contact_message", subject: `ip:${ip}`, ...CONTACT_LIMIT };
  const wait = await blockedFor([limit]);
  if (wait) return { error: `Muitas mensagens em pouco tempo. Aguarde ${wait} minuto${wait > 1 ? "s" : ""} e tente de novo.`, fields };
  if (!mailConfigured()) return { error: "O envio de mensagens está indisponível agora. Escreva direto para o nosso e-mail.", fields };
  await recordAttempt(limit.action, [limit.subject]);
  try {
    const res = await sendMail(contactMail(fields));
    if (res.ok) return { ok: true };
    log("error", "contato", `${res.provider} respondeu ${res.status}: ${await res.detail()}`);
  } catch (e) {
    log("error", "contato", `Falha de rede no envio: ${(e as Error).message}`);
  }
  return { error: "Não conseguimos enviar sua mensagem agora. Tente de novo em alguns minutos ou escreva direto para o nosso e-mail.", fields };
}
