import { externalHref } from "@/lib/url";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listAttachments } from "@/lib/attachments";
import {
  DELIVERY_STATUS, FUNCTION_MAX, PROJECT_ROLE_PT, TASK_STATUS, TASK_TEXT_MAX, assignable, brDay, canDeleteTask, canDeliver, canReview, isCoord,
  listDeliveries, listTasks, statusesFor, taskContext, type TaskStatus,
} from "@/lib/project-tasks";
import {
  assignProjectTask, createProjectTask, deleteProjectTask, reviewProjectDelivery, setProjectMemberRole, setProjectTaskStatus, submitProjectDelivery,
} from "@/lib/edu-actions";
import { Badge, Card, Empty, Flash, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tarefas do projeto — Ponte" };

const today = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

export default async function TarefasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const ctx = await taskContext(Number(id), user);
  if (!ctx) notFound();
  const { view, team, me } = ctx;
  const p = view.project;
  if (!me) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">Tarefas do projeto</h1>
        <p className="mt-2 text-muted">So quem participa do projeto ve as tarefas.</p>
        <Link href={`/projetos/${p.id}`} className={`${btnCls} mt-6`}>Voltar ao projeto</Link>
      </div>
    );
  }
  const [tasks, deliveries, files] = await Promise.all([listTasks(p.id), listDeliveries(p.id), listAttachments({ scope: "project", projectId: p.id })]);
  const myFiles = files.filter((f) => f.owner_id === me.id);
  const people = assignable(team);
  const coord = isCoord(me);
  const hidden = (extra: Record<string, number> = {}) => (
    <>{Object.entries({ project_id: p.id, ...extra }).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}</>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 py-10">
      <Link href={`/projetos/${p.id}`} className="text-sm text-muted hover:text-fg">← {p.title}</Link>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Tarefas</h1>
        <p className="mt-2 text-sm text-muted">So a equipe do projeto ve esta pagina. Seu papel: <strong className="text-fg">{PROJECT_ROLE_PT[me.role]}</strong>{me.fn && ` · ${me.fn}`}.</p>
      </div>
      <Flash params={sp} />

      <Card>
        <h2 id="equipe" className="scroll-mt-24 font-semibold">Equipe</h2>
        <p className="mt-1 text-xs text-muted">A coordenacao cria, distribui e revisa as tarefas. Participantes criam tarefas para si e entregam as suas. Mentores revisam as entregas.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {team.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line p-2">
              <Link href={`/pessoas/${m.id}`} className="font-medium text-accent hover:underline">{m.name}</Link>
              <Badge kind={m.role === "coordinator" ? "active" : m.role === "mentor" ? "mentor" : "projeto"} label={PROJECT_ROLE_PT[m.role]} />
              {m.fn && <span className="text-xs text-muted">{m.fn}</span>}
              {view.isOwner && (
                <form action={setProjectMemberRole} className="ml-auto flex flex-wrap items-center gap-2">
                  {hidden({ member_id: m.id })}
                  {m.role !== "mentor" && !m.owner && (
                    <select name="role" defaultValue={m.role} aria-label={`Papel de ${m.name}`} className={`${inputCls} w-auto py-1 text-xs`}>
                      <option value="participant">Participante</option>
                      <option value="coordinator">Coordenacao</option>
                    </select>
                  )}
                  <input name="function" defaultValue={m.fn} maxLength={FUNCTION_MAX} placeholder="Funcao (ex.: Front-end)" aria-label={`Funcao de ${m.name}`} className={`${inputCls} w-40 py-1 text-xs`} />
                  <button className="text-xs text-accent hover:underline">Salvar</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {me.role !== "mentor" && (
        <Card>
          <h2 className="font-semibold">Nova tarefa</h2>
          <form action={createProjectTask} className="mt-3 space-y-2">
            {hidden()}
            <input name="title" required minLength={2} maxLength={120} placeholder="Titulo" aria-label="Titulo da tarefa" className={inputCls} />
            <textarea name="description" rows={2} maxLength={TASK_TEXT_MAX} placeholder="Descricao (opcional)" aria-label="Descricao da tarefa" className={inputCls} />
            <div className="grid gap-2 sm:grid-cols-2">
              {coord ? (
                <select name="assignee_id" defaultValue={me.id} aria-label="Responsavel" className={inputCls}>
                  <option value="">Sem responsavel</option>
                  {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : <p className="self-center text-xs text-muted">Responsavel: voce</p>}
              <input name="due_on" type="date" aria-label="Prazo (opcional)" className={inputCls} />
            </div>
            <button className={btnSecondaryCls}>Criar tarefa</button>
          </form>
        </Card>
      )}

      {(Object.keys(TASK_STATUS) as TaskStatus[]).map((st) => {
        const list = tasks.filter((t) => t.status === st);
        return (
          <section key={st}>
            <h2 className="text-lg font-semibold">{TASK_STATUS[st]} ({list.length})</h2>
            {list.length === 0 ? <div className="mt-2"><Empty>Nenhuma tarefa.</Empty></div> : (
              <ul className="mt-3 space-y-3">
                {list.map((t) => {
                  const ds = deliveries.filter((d) => d.task_id === t.id);
                  const pending = ds.some((d) => d.status === "pending");
                  const statuses = statusesFor(me, t).filter((s) => s !== t.status);
                  const late = t.due_on && t.status !== "done" && t.due_on < today();
                  return (
                    <li key={t.id} id={`tarefa-${t.id}`} className="scroll-mt-24 rounded-xl border border-line p-4 text-sm">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="font-semibold [overflow-wrap:anywhere]">{t.title}</p>
                        {pending && <Badge kind="requested" label="Entrega em revisao" />}
                      </div>
                      <p className="mt-1 text-xs text-muted">
                        Responsavel: {t.assignee_name ?? "sem responsavel"}
                        {t.due_on && <> · <span className={late ? "text-red-300" : ""}>Prazo: {brDay(t.due_on)}{late && " (atrasada)"}</span></>}
                        {" "}· Criada por {t.creator_name ?? "Conta excluida"}
                      </p>
                      {t.description && <p className="mt-2 whitespace-pre-line text-muted [overflow-wrap:anywhere]">{t.description}</p>}
                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        {statuses.map((s) => (
                          <form key={s} action={setProjectTaskStatus}>{hidden({ task_id: t.id })}<input type="hidden" name="status" value={s} />
                            <button className="text-xs text-accent hover:underline">Mover para {TASK_STATUS[s]}</button></form>
                        ))}
                        {coord && (
                          <form action={assignProjectTask} className="flex items-center gap-1">{hidden({ task_id: t.id })}
                            <select name="assignee_id" defaultValue={t.assignee_id ?? ""} aria-label="Distribuir para" className={`${inputCls} w-auto py-1 text-xs`}>
                              <option value="">Sem responsavel</option>
                              {people.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                            <button className="text-xs text-accent hover:underline">Distribuir</button>
                          </form>
                        )}
                        {canDeleteTask(me, t) && (
                          <form action={deleteProjectTask}>{hidden({ task_id: t.id })}<button className="text-xs text-muted hover:text-red-300">Excluir tarefa</button></form>
                        )}
                      </div>
                      {ds.length > 0 && (
                        <ul className="mt-3 space-y-2 border-t border-line pt-3">
                          {ds.map((d) => (
                            <li key={d.id} className="rounded-md bg-raised p-3">
                              <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                                <span>Entrega de {d.author_name ?? "Conta excluida"} · {brDay(d.created_at.slice(0, 10))}</span>
                                <Badge kind={d.status === "approved" ? "active" : d.status === "changes" ? "pending" : "requested"} label={DELIVERY_STATUS[d.status]} />
                              </p>
                              {d.body && <p className="mt-1 whitespace-pre-line [overflow-wrap:anywhere]">{d.body}</p>}
                              <div className="mt-1 flex flex-wrap gap-3 text-xs">
                                {d.link && <a href={externalHref(d.link)} target="_blank" rel="noreferrer" className="text-accent hover:underline">Link ↗</a>}
                                {d.attachment_id && d.file_title !== null && <a href={`/arquivos/${d.attachment_id}`} target="_blank" rel="noreferrer" className="text-accent hover:underline">Arquivo: {d.file_title}</a>}
                              </div>
                              {d.status !== "pending" && (d.review_comment || d.reviewer_name) && (
                                <p className="mt-2 text-xs text-muted">Revisao de {d.reviewer_name ?? "Conta excluida"}{d.review_comment && `: ${d.review_comment}`}</p>
                              )}
                              {canReview(me, d) && (
                                <form action={reviewProjectDelivery} className="mt-2 space-y-2">{hidden({ delivery_id: d.id })}
                                  <textarea name="comment" rows={2} maxLength={TASK_TEXT_MAX} placeholder="Comentario (obrigatorio para pedir ajustes)" aria-label="Comentario da revisao" className={inputCls} />
                                  <div className="flex gap-2">
                                    <button name="decision" value="approved" className={btnCls}>Aprovar</button>
                                    <button name="decision" value="changes" className={btnSecondaryCls}>Pedir ajustes</button>
                                  </div>
                                </form>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {canDeliver(me, t, pending) && (
                        <details className="mt-3">
                          <summary className="cursor-pointer text-xs font-semibold text-accent">Entregar</summary>
                          <form action={submitProjectDelivery} className="mt-2 space-y-2">{hidden({ task_id: t.id })}
                            <textarea name="body" rows={3} maxLength={TASK_TEXT_MAX} placeholder="O que voce fez" aria-label="Texto da entrega" className={inputCls} />
                            <input name="link" placeholder="Link (opcional)" aria-label="Link da entrega" className={inputCls} />
                            {myFiles.length > 0 && (
                              <select name="attachment_id" defaultValue="" aria-label="Arquivo do projeto" className={inputCls}>
                                <option value="">Sem arquivo</option>
                                {myFiles.map((f) => <option key={f.id} value={f.id}>{f.title || f.filename}</option>)}
                              </select>
                            )}
                            <p className="text-xs text-muted">Para entregar um arquivo, anexe-o antes em Arquivos do projeto, na pagina do projeto.</p>
                            <button className={btnSecondaryCls}>Enviar entrega</button>
                          </form>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
