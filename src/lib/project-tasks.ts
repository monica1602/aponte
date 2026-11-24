import { getDb, type User } from "./db";
import { getProjectForViewer, type ProjectView } from "./projects";

export const TASK_MAX = 100;
export const TASK_LIMIT = { max: 60, windowMin: 60 };
export const TASK_TEXT_MAX = 1000;
export const FUNCTION_MAX = 40;
export const TASK_STATUS = { todo: "A fazer", doing: "Fazendo", done: "Feita" } as const;
export type TaskStatus = keyof typeof TASK_STATUS;
export const PROJECT_ROLE_PT = { coordinator: "Coordenacao", participant: "Participante", mentor: "Mentor" } as const;
export type ProjectRole = keyof typeof PROJECT_ROLE_PT;
export const DELIVERY_STATUS = { pending: "Em revisao", approved: "Aprovada", changes: "Ajustes pedidos" } as const;

export type TeamMember = { id: number; name: string; role: ProjectRole; fn: string; owner: boolean };
export type Task = {
  id: number; project_id: number; created_by: number | null; assignee_id: number | null; title: string; description: string;
  due_on: string; status: TaskStatus; created_at: string; assignee_name: string | null; creator_name: string | null;
};
export type Delivery = {
  id: number; task_id: number; author_id: number | null; body: string; link: string; attachment_id: number | null; status: keyof typeof DELIVERY_STATUS;
  reviewer_id: number | null; review_comment: string; reviewed_at: string | null; created_at: string;
  author_name: string | null; reviewer_name: string | null; file_title: string | null;
};

/** Equipe do projeto: quem criou (coordenacao), participantes aceitos e mentores com acesso. */
export async function teamOf(view: ProjectView): Promise<TeamMember[]> {
  const db = getDb();
  const id = view.project.id;
  const ownerFn = String((view.project as unknown as { owner_function?: string }).owner_function ?? "");
  const parts = (await db.prepare(
    `SELECT pa.user_id AS id, u.name, pa.project_role, pa.project_function FROM project_applications pa JOIN users u ON u.id = pa.user_id
     WHERE pa.project_id = ? AND pa.status = 'accepted' ORDER BY u.name`
  ).all(id)) as { id: number; name: string; project_role: string; project_function: string }[];
  const mentors = (await db.prepare(
    `SELECT a.mentor_id AS id, u.name, a.project_function FROM project_access a JOIN users u ON u.id = a.mentor_id
     WHERE a.project_id = ? AND a.revoked_at IS NULL AND u.role = 'mentor' ORDER BY u.name`
  ).all(id)) as { id: number; name: string; project_function: string }[];
  const team: TeamMember[] = [{ id: view.owner.id, name: view.owner.name, role: "coordinator", fn: ownerFn, owner: true }];
  for (const p of parts) if (!team.some((m) => m.id === p.id)) team.push({ id: p.id, name: p.name, role: p.project_role === "coordinator" ? "coordinator" : "participant", fn: p.project_function, owner: false });
  for (const m of mentors) if (!team.some((x) => x.id === m.id)) team.push({ id: m.id, name: m.name, role: "mentor", fn: m.project_function, owner: false });
  return team;
}

export type TaskContext = { view: ProjectView; team: TeamMember[]; me: TeamMember | null };

export async function taskContext(projectId: number, user: User | null): Promise<TaskContext | null> {
  const view = await getProjectForViewer(projectId, user);
  if (!view) return null;
  const team = await teamOf(view);
  return { view, team, me: user ? team.find((m) => m.id === user.id) ?? null : null };
}

export const isCoord = (me: TeamMember | null) => me?.role === "coordinator";
export const assignable = (team: TeamMember[]) => team.filter((m) => m.role !== "mentor");

/** 2A: a coordenacao distribui para qualquer pessoa da equipe (menos mentores); participantes criam so para si. */
export function canCreateFor(me: TeamMember | null, team: TeamMember[], assigneeId: number | null): boolean {
  if (!me || me.role === "mentor") return false;
  if (me.role === "participant") return assigneeId === me.id;
  return assigneeId === null || assignable(team).some((m) => m.id === assigneeId);
}

/** O responsavel move entre A fazer e Fazendo; "Feita" vem da aprovacao da entrega ou da coordenacao. */
export function statusesFor(me: TeamMember | null, task: Pick<Task, "assignee_id">): TaskStatus[] {
  if (isCoord(me)) return ["todo", "doing", "done"];
  if (me && task.assignee_id === me.id) return ["todo", "doing"];
  return [];
}

export function canDeleteTask(me: TeamMember | null, task: Pick<Task, "created_by">): boolean {
  return isCoord(me) || (!!me && me.role === "participant" && task.created_by === me.id);
}

export function canDeliver(me: TeamMember | null, task: Pick<Task, "assignee_id" | "status">, hasPending: boolean): boolean {
  return !!me && task.assignee_id === me.id && task.status !== "done" && !hasPending;
}

/** 3A: a coordenacao ou um mentor revisa; ninguem revisa a propria entrega. */
export function canReview(me: TeamMember | null, d: Pick<Delivery, "author_id" | "status">): boolean {
  return !!me && (me.role === "coordinator" || me.role === "mentor") && d.author_id !== me.id && d.status === "pending";
}

export function taskProblem(title: string, description: string, due: string): string | null {
  if (title.length < 2) return "Escreva o titulo da tarefa.";
  if (description.length > TASK_TEXT_MAX) return `A descricao pode ter ate ${TASK_TEXT_MAX} caracteres.`;
  if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(`${due}T00:00:00Z`)))) return "Prazo invalido.";
  return null;
}

export async function listTasks(projectId: number): Promise<Task[]> {
  return (await getDb().prepare(
    `SELECT t.*, a.name AS assignee_name, c.name AS creator_name FROM project_tasks t
     LEFT JOIN users a ON a.id = t.assignee_id LEFT JOIN users c ON c.id = t.created_by
     WHERE t.project_id = ? ORDER BY CASE WHEN t.due_on = '' THEN 1 ELSE 0 END, t.due_on, t.id`
  ).all(projectId)) as unknown as Task[];
}

export async function getTask(taskId: number, projectId: number): Promise<Task | null> {
  return ((await getDb().prepare(
    `SELECT t.*, a.name AS assignee_name, c.name AS creator_name FROM project_tasks t
     LEFT JOIN users a ON a.id = t.assignee_id LEFT JOIN users c ON c.id = t.created_by WHERE t.id = ? AND t.project_id = ?`
  ).get(taskId, projectId)) as Task | undefined) ?? null;
}

export async function listDeliveries(projectId: number): Promise<Delivery[]> {
  return (await getDb().prepare(
    `SELECT d.*, a.name AS author_name, r.name AS reviewer_name, f.title AS file_title FROM project_deliveries d
     JOIN project_tasks t ON t.id = d.task_id LEFT JOIN users a ON a.id = d.author_id LEFT JOIN users r ON r.id = d.reviewer_id
     LEFT JOIN attachments f ON f.id = d.attachment_id AND f.project_id = t.project_id
     WHERE t.project_id = ? ORDER BY d.created_at, d.id`
  ).all(projectId)) as unknown as Delivery[];
}

export async function myOpenTasks(userId: number) {
  return (await getDb().prepare(
    `SELECT t.id, t.title, t.due_on, t.status, p.id AS project_id, p.title AS project_title FROM project_tasks t JOIN projects p ON p.id = t.project_id
     WHERE t.assignee_id = ? AND t.status != 'done' ORDER BY CASE WHEN t.due_on = '' THEN 1 ELSE 0 END, t.due_on, t.id`
  ).all(userId)) as { id: number; title: string; due_on: string; status: TaskStatus; project_id: number; project_title: string }[];
}

/** Quem sai do projeto deixa de ser responsavel e volta a ser participante se entrar de novo. */
export async function releaseMember(projectId: number, userId: number): Promise<void> {
  const db = getDb();
  await db.prepare("UPDATE project_tasks SET assignee_id = NULL WHERE project_id = ? AND assignee_id = ?").run(projectId, userId);
  await db.prepare("UPDATE project_applications SET project_role = 'participant' WHERE project_id = ? AND user_id = ?").run(projectId, userId);
}

export const brDay = (d: string) => d.split("-").reverse().join("/");
