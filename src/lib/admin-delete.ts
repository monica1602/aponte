import { audit, getDb, notify } from "./db";

export const DELETE_KINDS = ["conta", "evento", "projeto"] as const;
export type DeleteKind = (typeof DELETE_KINDS)[number];
export const DELETE_REASON_MAX = 300;
export const DELETE_KIND_PT: Record<DeleteKind, string> = { conta: "Conta", evento: "Evento", projeto: "Projeto" };
const ROLE_LABEL: Record<string, string> = { mentee: "Mentorado", mentor: "Mentor", company: "Empresa" };
const LIST_OF_ROLE: Record<string, string> = { mentee: "/admin/mentorados", mentor: "/admin/mentores", company: "/admin/empresas" };

export type DeletePreview = {
  kind: DeleteKind;
  id: number;
  title: string;
  subtitle: string;
  removed: { label: string; n: number }[];
  kept: string[];
  back: string;
  list: string;
};

async function count(sql: string, ...params: (number | string)[]): Promise<number> {
  const row = (await getDb().prepare(sql).get(...params)) as { n: number | string } | undefined;
  return Number(row?.n ?? 0);
}

const EVENT_PEOPLE = `SELECT user_id FROM event_registrations WHERE event_id = ? AND status IN ('requested','approved','waitlist')
  UNION SELECT user_id FROM event_invites WHERE event_id = ?`;
const PROJECT_PEOPLE = `SELECT user_id FROM project_applications WHERE project_id = ? AND status IN ('pending','accepted')
  UNION SELECT mentor_id FROM project_access WHERE project_id = ? AND revoked_at IS NULL
  UNION SELECT mentor_id FROM project_mentor_invites WHERE project_id = ?
  UNION SELECT user_id FROM project_member_invites WHERE project_id = ?`;

async function people(sql: string, id: number, times: number, except = 0): Promise<number[]> {
  const rows = (await getDb().prepare(sql).all(...Array(times).fill(id))) as unknown as { user_id: number }[];
  return rows.map((r) => Number(r.user_id)).filter((u) => u !== except);
}

/** O que sai junto com a exclusao, para a tela de conferencia do admin. */
export async function deletionPreview(kind: DeleteKind, id: number): Promise<DeletePreview | null> {
  const db = getDb();
  if (kind === "conta") {
    const u = (await db.prepare("SELECT id, name, email, role, email_status FROM users WHERE id = ?").get(id)) as
      | { id: number; name: string; email: string; role: string; email_status: string }
      | undefined;
    if (!u) return null;
    const othersCerts = await count("SELECT COUNT(*) AS n FROM certificates c JOIN events e ON e.id = c.event_id WHERE e.owner_id = ? AND c.user_id <> ?", id, id);
    return {
      kind, id, title: u.name,
      subtitle: `${ROLE_LABEL[u.role] ?? u.role} · ${u.email} · e-mail ${u.email_status === "verified" ? "confirmado" : "nao confirmado"}`,
      removed: [
        { label: "Inscricoes em eventos", n: await count("SELECT COUNT(*) AS n FROM event_registrations WHERE user_id = ?", id) },
        { label: "Eventos criados por esta conta", n: await count("SELECT COUNT(*) AS n FROM events WHERE owner_id = ?", id) },
        { label: "Inscricoes de outras pessoas nesses eventos", n: await count("SELECT COUNT(*) AS n FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE e.owner_id = ? AND r.user_id <> ?", id, id) },
        { label: "Projetos criados por esta conta", n: await count("SELECT COUNT(*) AS n FROM projects WHERE owner_id = ?", id) },
        { label: "Participacoes de outras pessoas nesses projetos", n: await count("SELECT COUNT(*) AS n FROM project_applications a JOIN projects p ON p.id = a.project_id WHERE p.owner_id = ? AND a.user_id <> ?", id, id) },
        { label: "Mentorias", n: await count("SELECT COUNT(*) AS n FROM mentorships WHERE mentor_id = ? OR mentee_id = ?", id, id) },
        { label: "Certificados desta pessoa", n: await count("SELECT COUNT(*) AS n FROM certificates WHERE user_id = ?", id) },
        { label: "Mensagens enviadas (o texto e apagado)", n: await count("SELECT COUNT(*) AS n FROM messages WHERE sender_id = ?", id) },
        { label: "Contribuicoes", n: await count("SELECT COUNT(*) AS n FROM contributions WHERE user_id = ?", id) },
        { label: "Anexos enviados", n: await count("SELECT COUNT(*) AS n FROM attachments WHERE owner_id = ?", id) },
      ],
      kept: othersCerts ? [`${othersCerts} certificado(s) emitido(s) para outras pessoas nos eventos desta conta continuam validos.`] : [],
      back: `/admin/usuarios/${id}`,
      list: LIST_OF_ROLE[u.role] ?? "/admin",
    };
  }
  if (kind === "evento") {
    const e = (await db.prepare("SELECT e.id, e.title, e.starts_at, u.name AS owner FROM events e JOIN users u ON u.id = e.owner_id WHERE e.id = ?").get(id)) as
      | { id: number; title: string; starts_at: string; owner: string }
      | undefined;
    if (!e) return null;
    const certs = await count("SELECT COUNT(*) AS n FROM certificates WHERE event_id = ?", id);
    return {
      kind, id, title: e.title,
      subtitle: `Evento de ${e.owner} · inicio ${e.starts_at.replace("T", " ")}`,
      removed: [
        { label: "Inscricoes", n: await count("SELECT COUNT(*) AS n FROM event_registrations WHERE event_id = ?", id) },
        { label: "Convites", n: await count("SELECT COUNT(*) AS n FROM event_invites WHERE event_id = ?", id) },
        { label: "Anexos", n: await count("SELECT COUNT(*) AS n FROM attachments WHERE event_id = ?", id) },
      ],
      kept: certs ? [`${certs} certificado(s) ja emitido(s) continuam validos, com o titulo do evento.`] : [],
      back: "/admin/eventos",
      list: "/admin/eventos",
    };
  }
  const p = (await db.prepare("SELECT p.id, p.title, u.name AS owner FROM projects p JOIN users u ON u.id = p.owner_id WHERE p.id = ?").get(id)) as
    | { id: number; title: string; owner: string }
    | undefined;
  if (!p) return null;
  const goals = await count("SELECT COUNT(*) AS n FROM learning_goals WHERE project_id = ?", id);
  return {
    kind, id, title: p.title,
    subtitle: `Projeto de ${p.owner}`,
    removed: [
      { label: "Candidaturas e participantes", n: await count("SELECT COUNT(*) AS n FROM project_applications WHERE project_id = ?", id) },
      { label: "Mentores com acesso e convites", n: await count("SELECT (SELECT COUNT(*) FROM project_access WHERE project_id = ?) + (SELECT COUNT(*) FROM project_mentor_invites WHERE project_id = ?) + (SELECT COUNT(*) FROM project_member_invites WHERE project_id = ?) AS n", id, id, id) },
      { label: "Tarefas", n: await count("SELECT COUNT(*) AS n FROM project_tasks WHERE project_id = ?", id) },
      { label: "Entregas", n: await count("SELECT COUNT(*) AS n FROM project_deliveries d JOIN project_tasks t ON t.id = d.task_id WHERE t.project_id = ?", id) },
      { label: "Comentarios", n: await count("SELECT COUNT(*) AS n FROM project_feedback WHERE project_id = ?", id) },
      { label: "Anexos", n: await count("SELECT COUNT(*) AS n FROM attachments WHERE project_id = ?", id) },
    ],
    kept: goals ? [`${goals} meta(s) de aprendizado ligada(s) ao projeto continuam, sem o projeto.`] : [],
    back: "/admin/projetos",
    list: "/admin/projetos",
  };
}

async function removeEvent(id: number, title: string, except = 0) {
  const db = getDb();
  const who = await people(EVENT_PEOPLE, id, 2, except);
  await db.prepare("DELETE FROM attachments WHERE event_id = ?").run(id);
  await db.prepare("DELETE FROM events WHERE id = ?").run(id);
  for (const u of who) await notify(u, `O evento "${title}" foi excluido pela administracao.`, "/eventos");
}

async function removeProject(id: number, title: string, except = 0) {
  const db = getDb();
  const who = await people(PROJECT_PEOPLE, id, 4, except);
  await db.prepare("DELETE FROM project_deliveries WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id = ?)").run(id);
  await db.prepare("DELETE FROM project_tasks WHERE project_id = ?").run(id);
  await db.prepare("DELETE FROM attachments WHERE project_id = ?").run(id);
  await db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  for (const u of who) await notify(u, `O projeto "${title}" foi excluido pela administracao.`, "/projetos");
}

async function removeAccount(id: number) {
  const db = getDb();
  const own = async (sql: string) => (await db.prepare(sql).all(id)) as unknown as { id: number; title: string }[];
  for (const e of await own("SELECT id, title FROM events WHERE owner_id = ?")) await removeEvent(Number(e.id), e.title, id);
  for (const p of await own("SELECT id, title FROM projects WHERE owner_id = ?")) await removeProject(Number(p.id), p.title, id);
  await db.prepare("DELETE FROM sessions WHERE user_id = ?").run(id);
  await db.prepare("DELETE FROM legal_acceptances WHERE user_id = ?").run(id);
  await db.prepare("DELETE FROM consent_events WHERE user_id = ?").run(id);
  await db.prepare("DELETE FROM data_requests WHERE user_id = ?").run(id);
  await db.prepare("DELETE FROM email_changes WHERE user_id = ?").run(id);
  await db.prepare("DELETE FROM certificate_history WHERE certificate_id IN (SELECT id FROM certificates WHERE user_id = ?)").run(id);
  await db.prepare("UPDATE messages SET body = NULL WHERE sender_id = ?").run(id);
  await db.prepare("DELETE FROM attachments WHERE owner_id = ?").run(id);
  await db.prepare("UPDATE project_tasks SET assignee_id = NULL WHERE assignee_id = ?").run(id);
  await db.prepare("UPDATE project_tasks SET created_by = NULL WHERE created_by = ?").run(id);
  await db.prepare("UPDATE project_deliveries SET author_id = NULL WHERE author_id = ?").run(id);
  await db.prepare("UPDATE project_deliveries SET reviewer_id = NULL WHERE reviewer_id = ?").run(id);
  await db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

/** Exclusao definitiva pelo admin. Guarda so o tipo, o numero e o motivo, sem os dados da pessoa. */
export async function deleteAsAdmin(kind: DeleteKind, id: number, reason: string): Promise<DeletePreview | null> {
  const preview = await deletionPreview(kind, id);
  if (!preview) return null;
  if (kind === "conta") await removeAccount(id);
  else if (kind === "evento") await removeEvent(id, preview.title);
  else await removeProject(id, preview.title);
  const detail = kind === "conta" ? preview.subtitle.split(" · ")[0] : DELETE_KIND_PT[kind];
  await getDb().prepare("INSERT INTO admin_deletions (entity_type, entity_id, detail, reason) VALUES (?,?,?,?)").run(kind, id, detail, reason);
  await audit(null, `admin.${kind}.delete`, kind === "conta" ? "user" : kind === "evento" ? "event" : "project", id);
  return preview;
}

export type DeletionLog = { entity_type: DeleteKind; entity_id: number; detail: string; reason: string; deleted_at: string };
export async function recentDeletions(limit = 30): Promise<DeletionLog[]> {
  return (await getDb()
    .prepare("SELECT entity_type, entity_id, detail, reason, deleted_at FROM admin_deletions ORDER BY id DESC LIMIT ?")
    .all(limit)) as unknown as DeletionLog[];
}

export type AdminProject = { id: number; title: string; kind: string; status: string; visibility: string; created_at: string; owner_id: number; owner_name: string; participants: number };
export async function listAllProjects(): Promise<AdminProject[]> {
  const rows = (await getDb().prepare(
    `SELECT p.id, p.title, p.kind, p.status, p.visibility, p.created_at, p.owner_id, u.name AS owner_name,
       (SELECT COUNT(*) FROM project_applications a WHERE a.project_id = p.id AND a.status = 'accepted') AS participants
     FROM projects p JOIN users u ON u.id = p.owner_id ORDER BY p.created_at DESC, p.id DESC`
  ).all()) as unknown as AdminProject[];
  return rows.map((r) => ({ ...r, participants: Number(r.participants) }));
}
