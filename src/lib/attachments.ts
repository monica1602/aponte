import { canSeeEmail, getDb, type User } from "./db";
import { getProjectForViewer } from "./projects";
import { listMeetings, meetingPath, type MeetingKind } from "./meetings";

export const ATTACH_MAX_BYTES = 2 * 1024 * 1024;
export const ATTACH_USER_TOTAL = 12 * 1024 * 1024;
export const ATTACH_SITE_TOTAL = 300 * 1024 * 1024;
export const ATTACH_SITE_WARN = 0.8;
export const ATTACH_TITLE_MAX = 80;
export const ATTACH_LIMIT = { max: 20, windowMin: 60 };
export const ATTACH_SCOPES = ["resume", "profile", "project", "meeting", "event_material", "event_evidence"] as const;
export type AttachScope = (typeof ATTACH_SCOPES)[number];
export const SCOPE_MAX: Record<AttachScope, number> = { resume: 1, profile: 5, project: 10, meeting: 10, event_material: 10, event_evidence: 1 };
export const SCOPE_PT: Record<AttachScope, string> = {
  resume: "Curriculo", profile: "Portfolio", project: "Projeto", meeting: "Encontro", event_material: "Material do evento", event_evidence: "Evidencia do evento",
};
export const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";

/** Confere o conteudo do arquivo (nao o nome). So PDF, PNG, JPG e WebP. */
export function sniffType(b: Uint8Array): string | null {
  const s = (from: number, text: string) => [...text].every((c, i) => b[from + i] === c.charCodeAt(0));
  if (s(0, "%PDF-")) return "application/pdf";
  if (b[0] === 0x89 && s(1, "PNG\r\n\x1a\n")) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (s(0, "RIFF") && s(8, "WEBP")) return "image/webp";
  return null;
}

export function fileProblem(size: number, type: string | null, scope: AttachScope): string | null {
  if (!size) return "Escolha um arquivo.";
  if (size > ATTACH_MAX_BYTES) return "O arquivo pode ter ate 2 MB.";
  if (!type) return "Formato nao aceito. Envie PDF, PNG, JPG ou WebP.";
  if (scope === "resume" && type !== "application/pdf") return "O curriculo precisa ser um PDF.";
  return null;
}

export function safeFilename(name: string, type: string): string {
  const ext = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[type] ?? "bin";
  const base = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\.[^.]*$/, "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "arquivo";
  return `${base}.${ext}`;
}

export type Attachment = {
  id: number; owner_id: number; owner_name: string | null; scope: AttachScope; title: string; filename: string; mime: string; size: number;
  project_id: number | null; event_id: number | null; mentorship_meeting_id: number | null; company_meeting_id: number | null; target_user_id: number | null; created_at: string;
};
const COLS = `a.id, a.owner_id, u.name AS owner_name, a.scope, a.title, a.filename, a.mime, a.size, a.project_id, a.event_id,
  a.mentorship_meeting_id, a.company_meeting_id, a.owner_id AS target_user_id, a.created_at`;

export async function getAttachment(id: number): Promise<Attachment | null> {
  return ((await getDb().prepare(`SELECT ${COLS} FROM attachments a LEFT JOIN users u ON u.id = a.owner_id WHERE a.id = ?`).get(id)) as Attachment | undefined) ?? null;
}

export type AttachTarget = { scope: AttachScope; projectId?: number; eventId?: number; meetingKind?: MeetingKind; meetingId?: number; ownerId?: number };
export async function listAttachments(t: AttachTarget): Promise<Attachment[]> {
  const [where, params] = whereFor(t);
  return (await getDb().prepare(`SELECT ${COLS} FROM attachments a LEFT JOIN users u ON u.id = a.owner_id WHERE ${where} ORDER BY a.created_at, a.id`).all(...params)) as unknown as Attachment[];
}

export function whereFor(t: AttachTarget): [string, number[]] {
  if (t.scope === "project") return ["a.scope = 'project' AND a.project_id = ?", [t.projectId ?? 0]];
  if (t.scope === "meeting") return [`a.scope = 'meeting' AND a.${t.meetingKind === "company" ? "company_meeting_id" : "mentorship_meeting_id"} = ?`, [t.meetingId ?? 0]];
  if (t.scope === "event_material") return ["a.scope = 'event_material' AND a.event_id = ?", [t.eventId ?? 0]];
  if (t.scope === "event_evidence") return t.ownerId ? ["a.scope = 'event_evidence' AND a.event_id = ? AND a.owner_id = ?", [t.eventId ?? 0, t.ownerId]] : ["a.scope = 'event_evidence' AND a.event_id = ?", [t.eventId ?? 0]];
  return [`a.scope = '${t.scope}' AND a.owner_id = ?`, [t.ownerId ?? 0]];
}

async function eventOwner(eventId: number): Promise<number | null> {
  const e = (await getDb().prepare("SELECT owner_id FROM events WHERE id = ?").get(eventId)) as { owner_id: number } | undefined;
  return e?.owner_id ?? null;
}

/** Curriculo: segue a regra do e-mail, e tambem o organizador de um evento em que a pessoa esta inscrita. */
export async function canSeeResume(viewerId: number | null, owner: { id: number; show_email: number }): Promise<boolean> {
  if (!viewerId) return false;
  if (await canSeeEmail(viewerId, owner)) return true;
  return !!(await getDb().prepare(
    "SELECT 1 FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.owner_id = ? AND r.user_id = ? AND r.status IN ('requested','approved','waitlist')"
  ).get(viewerId, owner.id));
}

/** Permissao de ver ou baixar o arquivo, conferida no servidor a cada pedido. */
export async function canViewAttachment(a: Attachment, viewer: User | null, admin = false): Promise<boolean> {
  if (admin || (viewer && viewer.id === a.owner_id)) return true;
  const db = getDb();
  if (a.scope === "resume" || a.scope === "profile") {
    const owner = (await db.prepare("SELECT id, show_email, public_profile_consent, account_status FROM users WHERE id = ?").get(a.owner_id)) as
      { id: number; show_email: number; public_profile_consent: number; account_status: string } | undefined;
    if (!owner || owner.account_status === "suspended") return false;
    if (a.scope === "profile") return !!owner.public_profile_consent;
    return canSeeResume(viewer?.id ?? null, owner);
  }
  if (a.scope === "project") return !!a.project_id && !!(await getProjectForViewer(a.project_id, viewer));
  if (!viewer) return false;
  if (a.scope === "meeting") {
    const kind: MeetingKind = a.company_meeting_id ? "company" : "mentorship";
    const id = a.company_meeting_id ?? a.mentorship_meeting_id;
    return (await listMeetings(viewer.id)).some((m) => m.kind === kind && m.id === id);
  }
  if (!a.event_id) return false;
  if ((await eventOwner(a.event_id)) === viewer.id) return true;
  if (a.scope === "event_evidence") return false;
  return !!(await db.prepare("SELECT 1 FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = 'approved'").get(a.event_id, viewer.id));
}

/** Quem pode enviar para cada lugar. Retorna a mensagem de recusa, ou null. */
export async function uploadDenied(t: AttachTarget, user: User): Promise<string | null> {
  const db = getDb();
  if (t.scope === "resume" || t.scope === "profile") return null;
  if (t.scope === "project") {
    const view = await getProjectForViewer(t.projectId ?? 0, user);
    return view && (view.isOwner || view.participants.some((p) => p.id === user.id)) ? null : "So quem cria o projeto e quem foi aceito nele podem anexar arquivos.";
  }
  if (t.scope === "meeting") {
    const m = (await listMeetings(user.id)).find((x) => x.kind === t.meetingKind && x.id === t.meetingId);
    return m && m.status !== "cancelled" ? null : "Encontro nao encontrado ou cancelado.";
  }
  const ev = (await db.prepare("SELECT owner_id, status FROM events WHERE id = ?").get(t.eventId ?? 0)) as { owner_id: number; status: string } | undefined;
  if (!ev) return "Evento nao encontrado.";
  if (t.scope === "event_material") return ev.owner_id === user.id ? null : "So quem organiza o evento pode anexar materiais.";
  const reg = await db.prepare("SELECT 1 FROM event_registrations WHERE event_id = ? AND user_id = ? AND status = 'approved' AND checked_in_at IS NOT NULL").get(t.eventId ?? 0, user.id);
  return reg ? null : "A evidencia e so para quem fez check-in no evento.";
}

/** Quem pode remover: quem enviou; no projeto, tambem quem cria o projeto. */
export async function canRemoveAttachment(a: Attachment, userId: number): Promise<boolean> {
  if (a.owner_id === userId) return true;
  if (a.scope === "project" && a.project_id) {
    return !!(await getDb().prepare("SELECT 1 FROM projects WHERE id = ? AND owner_id = ?").get(a.project_id, userId));
  }
  return false;
}

export async function userAttachmentBytes(userId: number): Promise<number> {
  const r = (await getDb().prepare("SELECT COALESCE(SUM(size), 0) AS n FROM attachments WHERE owner_id = ?").get(userId)) as { n: number };
  return Number(r.n);
}

export async function siteAttachmentBytes(): Promise<number> {
  const r = (await getDb().prepare("SELECT COALESCE(SUM(size), 0) AS n FROM attachments").get()) as { n: number };
  return Number(r.n);
}

/** True only for the upload that takes the site total from below to at or above the warning level, so the admin is told once. */
export function crossesSiteWarning(before: number, added: number): boolean {
  const warn = ATTACH_SITE_TOTAL * ATTACH_SITE_WARN;
  return before < warn && before + added >= warn;
}

export function attachmentPath(t: AttachTarget): string {
  if (t.scope === "project") return `/projetos/${t.projectId}`;
  if (t.scope === "meeting") return meetingPath(t.meetingKind ?? "mentorship", t.meetingId ?? 0);
  if (t.scope === "event_material" || t.scope === "event_evidence") return `/eventos/${t.eventId}`;
  return "/perfil#arquivos";
}

export const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
