export const CONTACT = {
  email: "pessoasepontes@gmail.com",
  instagram: "https://www.instagram.com/pessoasepontes/",
  instagramHandle: "@pessoasepontes",
  linkedin: "https://www.linkedin.com/company/pessoas-e-pontes/",
  linkedinName: "Pessoas e Pontes",
};

export const CONTACT_TYPES = ["Dúvida", "Sugestão", "Elogio", "Reclamação", "Parceria", "Outro"] as const;

export const CONTACT_MAX = { name: 100, email: 200, message: 2000 };

/** Envios do formulario de contato por IP, por hora. */
export const CONTACT_LIMIT = { max: 5, windowMin: 60 };

export type ContactFields = { name: string; email: string; type: string; message: string };
export type ContactState = { ok?: boolean; error?: string; fields?: ContactFields };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function contactProblem(f: ContactFields): string | null {
  if (!f.name) return "Informe seu nome.";
  if (f.name.length > CONTACT_MAX.name) return `Nome: use no máximo ${CONTACT_MAX.name} caracteres.`;
  if (!EMAIL_RE.test(f.email) || f.email.length > CONTACT_MAX.email) return "Informe um e-mail válido.";
  if (!(CONTACT_TYPES as readonly string[]).includes(f.type)) return "Escolha o tipo da mensagem.";
  if (!f.message) return "Escreva a descrição.";
  if (f.message.length > CONTACT_MAX.message) return `Descrição: use no máximo ${CONTACT_MAX.message} caracteres.`;
  return null;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function contactMail(f: ContactFields): { to: string; subject: string; html: string; text: string; replyTo: string } {
  const name = f.name.replace(/[\r\n]+/g, " ");
  return {
    to: CONTACT.email,
    replyTo: f.email,
    subject: `[Contato] ${f.type} — ${name}`,
    html: `<p><strong>Nome:</strong> ${esc(name)}<br><strong>E-mail:</strong> ${esc(f.email)}<br><strong>Tipo:</strong> ${esc(f.type)}</p><p style="white-space:pre-wrap">${esc(f.message)}</p><p style="color:#777;font-size:12px">Enviado pelo formulário de Contatos do site da Ponte. Use Responder para falar com a pessoa.</p>`,
    text: `Nome: ${name}\nE-mail: ${f.email}\nTipo: ${f.type}\n\n${f.message}\n\nEnviado pelo formulário de Contatos do site da Ponte. Use Responder para falar com a pessoa.`,
  };
}
