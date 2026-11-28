/** Envio de e-mails: pelo Brevo quando BREVO_API_KEY existe; senao pelo Resend (RESEND_API_KEY). */
export const BREVO_SENDER = { name: "Ponte", email: "monica.prupst@yahoo.com.br" };

export type MailProvider = "Brevo" | "Resend";
export type Mail = { to: string; subject: string; html: string; text?: string; replyTo?: string };

export function mailProvider(): MailProvider | null {
  if (process.env.BREVO_API_KEY) return "Brevo";
  if (process.env.RESEND_API_KEY) return "Resend";
  return null;
}

export function mailConfigured(): boolean {
  return mailProvider() !== null;
}

/** Lanca erro so em falha de rede; resposta recusada volta com ok = false. */
export async function sendMail(m: Mail): Promise<{ ok: boolean; status: number; provider: MailProvider; detail: () => Promise<string> }> {
  const provider = mailProvider();
  if (!provider) throw new Error("Nenhum servico de e-mail configurado.");
  const res = provider === "Brevo"
    ? await fetch(process.env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": process.env.BREVO_API_KEY!, "Content-Type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          sender: BREVO_SENDER,
          to: [{ email: m.to }],
          subject: m.subject,
          htmlContent: m.html,
          ...(m.text ? { textContent: m.text } : {}),
          ...(m.replyTo ? { replyTo: { email: m.replyTo } } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      })
    : await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM ?? "Ponte <onboarding@resend.dev>",
          to: [m.to],
          subject: m.subject,
          html: m.html,
          ...(m.text ? { text: m.text } : {}),
          ...(m.replyTo ? { reply_to: m.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
  return { ok: res.ok, status: res.status, provider, detail: () => res.text() };
}
