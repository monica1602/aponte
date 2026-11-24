import crypto from "node:crypto";
import { getDb } from "./db";
import { hashToken } from "./reset-token";
import { consentHistory } from "./consents";
import { legalAcceptanceHistory } from "./legal-acceptance";

export const REQUEST_KIND_PT = {
  confirmacao: "Confirmar se a Ponte trata meus dados",
  acesso: "Acesso aos meus dados",
  correcao: "Correcao de dados",
  eliminacao: "Eliminacao de dados",
  outro: "Outro pedido",
} as const;
export type RequestKind = keyof typeof REQUEST_KIND_PT;
export const REQUEST_KINDS = Object.keys(REQUEST_KIND_PT) as RequestKind[];
export const REQUEST_DEADLINE_DAYS = 15;

export type DataRequest = {
  id: number;
  user_id: number;
  kind: RequestKind;
  message: string;
  status: "open" | "done";
  response: string;
  created_at: string;
  answered_at: string | null;
};

/** Prazo de resposta (AAAA-MM-DD), contado a partir do pedido. */
export function requestDeadline(createdAt: string): string {
  const d = new Date(`${createdAt.slice(0, 19).replace(" ", "T")}Z`);
  d.setUTCDate(d.getUTCDate() + REQUEST_DEADLINE_DAYS);
  return d.toISOString().slice(0, 10);
}

export const brDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

/** Rotulos das partes do arquivo de dados, na ordem em que aparecem. */
export const MY_DATA_SECTIONS = {
  conta: "Cadastro",
  perfil_detalhado: "Perfil detalhado",
  disponibilidade: "Disponibilidade",
  aceites_dos_documentos: "Aceites dos documentos",
  consentimentos: "Consentimentos",
  inscricoes_em_eventos: "Inscricoes e presenca em eventos",
  certificados: "Certificados",
  eventos_organizados: "Eventos organizados",
  mentorias: "Mentorias",
  encontros_de_mentoria: "Encontros de mentoria",
  vinculos_com_empresas: "Vinculos com empresas",
  projetos: "Projetos",
  candidaturas_em_projetos: "Candidaturas em projetos",
  metas_de_aprendizado: "Metas de aprendizado",
  contribuicoes: "Contribuicoes",
  feedbacks_escritos: "Feedbacks escritos",
  oportunidades: "Oportunidades publicadas",
  notificacoes: "Notificacoes",
  pedidos_sobre_dados: "Pedidos sobre seus dados",
  registro_de_acoes: "Registro das suas acoes (auditoria)",
} as const;
export type MyData = { gerado_em: string } & Record<keyof typeof MY_DATA_SECTIONS, unknown>;

/** Tudo o que a Ponte guarda sobre a pessoa. Senha, tokens e sessoes ficam de fora. */
export async function collectMyData(userId: number): Promise<MyData | null> {
  const db = getDb();
  const all = (sql: string, n = 1) => db.prepare(sql).all(...Array(n).fill(userId));
  const user = (await db.prepare("SELECT * FROM users WHERE id = ?").get(userId)) as Record<string, unknown> | undefined;
  if (!user) return null;
  delete user.password_hash;
  const profile = (await db.prepare("SELECT data, updated_at FROM profiles WHERE user_id = ?").get(userId)) as
    | { data: string; updated_at: string }
    | undefined;
  let perfil: Record<string, unknown> | null = null;
  if (profile) {
    try {
      perfil = { ...JSON.parse(profile.data), atualizado_em: profile.updated_at };
    } catch {
      perfil = { atualizado_em: profile.updated_at };
    }
  }
  return {
    gerado_em: new Date().toISOString(),
    conta: user,
    perfil_detalhado: perfil,
    disponibilidade: await all("SELECT weekday, start_time, end_time, visible_to_mentors FROM availability WHERE user_id = ? ORDER BY weekday, start_time"),
    aceites_dos_documentos: await legalAcceptanceHistory(userId),
    consentimentos: await consentHistory(userId),
    inscricoes_em_eventos: await all(
      `SELECT e.title AS evento, e.starts_at, e.ends_at, r.status, r.lgpd_accepted_at, r.communication_consent, r.image_consent,
              r.checked_in_at, r.checked_out_at, r.safe_home_at, r.created_at
       FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? ORDER BY e.starts_at DESC`
    ),
    certificados: await all("SELECT title, verification_code, issued_at FROM certificates WHERE user_id = ? ORDER BY issued_at DESC"),
    eventos_organizados: await all("SELECT title, starts_at, ends_at, modality, location, status, created_at FROM events WHERE owner_id = ? ORDER BY starts_at DESC"),
    mentorias: await all(
      `SELECT CASE WHEN m.mentor_id = ? THEN 'mentor' ELSE 'mentorado' END AS meu_papel, o.name AS outra_pessoa, m.status, m.created_at
       FROM mentorships m JOIN users o ON o.id = CASE WHEN m.mentor_id = ? THEN m.mentee_id ELSE m.mentor_id END
       WHERE m.mentor_id = ? OR m.mentee_id = ? ORDER BY m.created_at DESC`,
      4
    ),
    encontros_de_mentoria: await all(
      `SELECT mm.scheduled_at, mm.duration_minutes, mm.notes, mm.status, mm.created_at
       FROM mentorship_meetings mm JOIN mentorships m ON m.id = mm.mentorship_id
       WHERE m.mentor_id = ? OR m.mentee_id = ? ORDER BY mm.scheduled_at DESC`,
      2
    ),
    vinculos_com_empresas: await all(
      `SELECT CASE WHEN c.company_id = ? THEN 'empresa' ELSE 'membro' END AS meu_papel, o.name AS outra_parte, c.status, c.message, c.created_at
       FROM company_links c JOIN users o ON o.id = CASE WHEN c.company_id = ? THEN c.member_id ELSE c.company_id END
       WHERE c.company_id = ? OR c.member_id = ? ORDER BY c.created_at DESC`,
      4
    ),
    projetos: await all("SELECT title, kind, summary, description, status, visibility, created_at FROM projects WHERE owner_id = ? ORDER BY created_at DESC"),
    candidaturas_em_projetos: await all(
      `SELECT p.title AS projeto, a.message, a.status, a.created_at
       FROM project_applications a JOIN projects p ON p.id = a.project_id WHERE a.user_id = ? ORDER BY a.created_at DESC`
    ),
    metas_de_aprendizado: await all("SELECT title, description, due_on, status, created_at FROM learning_goals WHERE mentee_id = ? ORDER BY created_at DESC"),
    contribuicoes: await all("SELECT title, type, url, description, created_at FROM contributions WHERE user_id = ? ORDER BY created_at DESC"),
    feedbacks_escritos: await all(
      `SELECT 'projeto' AS sobre, body, created_at FROM project_feedback WHERE author_id = ?
       UNION ALL SELECT 'meta' AS sobre, body, created_at FROM goal_feedback WHERE author_id = ?
       ORDER BY created_at DESC`,
      2
    ),
    oportunidades: await all("SELECT type, title, description, skills, created_at FROM opportunities WHERE owner_id = ? ORDER BY created_at DESC"),
    notificacoes: await all("SELECT body, link, read_at, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC"),
    pedidos_sobre_dados: await all("SELECT kind, message, status, response, created_at, answered_at FROM data_requests WHERE user_id = ? ORDER BY created_at DESC"),
    registro_de_acoes: await all("SELECT action, entity_type, created_at FROM audit_log WHERE actor_id = ? ORDER BY created_at DESC"),
  };
}

export async function myDataRequests(userId: number): Promise<DataRequest[]> {
  return (await getDb().prepare("SELECT * FROM data_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC").all(userId)) as DataRequest[];
}

export async function allDataRequests() {
  return (await getDb()
    .prepare(
      `SELECT d.*, u.name AS user_name, u.email AS user_email FROM data_requests d JOIN users u ON u.id = d.user_id
       ORDER BY CASE WHEN d.status = 'open' THEN 0 ELSE 1 END, d.created_at, d.id`
    )
    .all()) as (DataRequest & { user_name: string; user_email: string })[];
}

export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

/** Link de uso unico para o e-mail novo. Substitui pedidos anteriores ainda nao usados. */
export async function createEmailChange(userId: number, newEmail: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const db = getDb();
  await db.prepare("DELETE FROM email_changes WHERE user_id = ? AND used_at IS NULL").run(userId);
  await db
    .prepare("INSERT INTO email_changes (user_id, new_email, token_hash, expires_at) VALUES (?,?,?,?)")
    .run(userId, newEmail, hashToken(token), Date.now() + EMAIL_CHANGE_TTL_MS);
  return token;
}

export type EmailChangeTarget = { user_id: number; name: string; old_email: string; new_email: string; expired: boolean };

export async function emailChangeTarget(token: string, now = Date.now()): Promise<EmailChangeTarget | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const row = (await getDb()
    .prepare(
      `SELECT c.user_id, u.name, u.email AS old_email, c.new_email, c.expires_at FROM email_changes c
       JOIN users u ON u.id = c.user_id WHERE c.token_hash = ? AND c.used_at IS NULL`
    )
    .get(hashToken(token))) as { user_id: number; name: string; old_email: string; new_email: string; expires_at: number } | undefined;
  if (!row) return null;
  return { user_id: Number(row.user_id), name: row.name, old_email: row.old_email, new_email: row.new_email, expired: Number(row.expires_at) <= now };
}

export async function markEmailChangeUsed(token: string): Promise<void> {
  await getDb().prepare("UPDATE email_changes SET used_at = datetime('now') WHERE token_hash = ?").run(hashToken(token));
}

export async function pendingEmailChange(userId: number, now = Date.now()): Promise<string | null> {
  const row = (await getDb()
    .prepare("SELECT new_email FROM email_changes WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY id DESC")
    .get(userId, now)) as { new_email: string } | undefined;
  return row?.new_email ?? null;
}

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Envia pelo Resend. Sem RESEND_API_KEY, registra no log e devolve false. */
export async function sendPlainEmail(to: string, subject: string, paragraphs: string[], button?: { label: string; link: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[meus-dados] RESEND_API_KEY ausente; e-mail para ${to}: ${subject}${button ? ` ${button.link}` : ""}`);
    return false;
  }
  const html = `<div style="background:#f4f6fb;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;color:#0c1720">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px">
    <tr><td style="padding:32px">
      <p style="margin:0 0 24px;font-size:20px;font-weight:bold">Ponte</p>
      ${paragraphs.map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5">${esc(p)}</p>`).join("")}
      ${button ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 24px"><tr><td style="border-radius:8px;background:#3d5afe">
        <a href="${esc(button.link)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px">${esc(button.label)}</a>
      </td></tr></table>
      <p style="margin:0;font-size:13px;line-height:1.5;color:#55606a">Se o botao nao funcionar, copie este endereco no navegador:<br><a href="${esc(button.link)}" style="color:#3d5afe;word-break:break-all">${esc(button.link)}</a></p>` : ""}
    </td></tr>
  </table>
</div>`;
  try {
    const res = await fetch(process.env.RESEND_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Ponte <onboarding@resend.dev>",
        to: [to],
        subject: `Ponte: ${subject}`.slice(0, 150),
        html,
        text: [...paragraphs, button ? `${button.label}: ${button.link}` : ""].filter(Boolean).join("\n\n"),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.warn(`[meus-dados] Resend respondeu ${res.status}`);
    return res.ok;
  } catch (e) {
    console.warn("[meus-dados] falha ao enviar:", (e as Error).message);
    return false;
  }
}
