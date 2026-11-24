import { externalHref } from "@/lib/url";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ReportForm } from "@/components/report-form";
import { AttachmentList, UploadForm } from "@/components/attachments";
import { listAttachments } from "@/lib/attachments";
import { getDb } from "@/lib/db";
import { getProjectForViewer, isMembersOnlyProject } from "@/lib/projects";
import { PROJECT_KINDS, PROJECT_STATUS, PROJECT_VISIBILITY, projectVisibility } from "@/lib/catalog";
import {
  addProjectFeedback, applyToProject, cancelApplication, deleteProject, inviteProjectMember, inviteProjectMentor, removeProjectParticipant, reviewApplication, revokeProjectAccess, updateProjectStatus, updateProjectVisibility,
} from "@/lib/edu-actions";
import { DeleteConfirm } from "@/components/delete-confirm";
import { Badge, Card, Empty, Flash, ROLE_LABELS, SkillChips, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Projeto — Ponte" };

export default async function ProjetoPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  const view = await getProjectForViewer(Number(id), user);
  if (!view && !user && await isMembersOnlyProject(Number(id))) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-2xl font-bold">Projeto so para cadastrados</h1>
        <p className="mt-2 text-muted">Entre para ver este projeto.</p>
        <Link href="/login" className={`${btnCls} mt-6`}>Entrar</Link>
      </div>
    );
  }
  // Same response for "does not exist" and "not allowed" so private projects are not revealed.
  if (!view) notFound();
  const { project: p, owner, isOwner, grantedMentors, participants } = view;
  const db = getDb();
  const projectFiles = await listAttachments({ scope: "project", projectId: p.id });
  const canAttach = !!user && (isOwner || participants.some((x) => x.id === user.id));
  const canComment = !!user && (isOwner || grantedMentors.some((m) => m.id === user.id) || participants.some((x) => x.id === user.id));
  const feedback = canComment
    ? (await db.prepare(
        `SELECT f.*, u.name, u.role FROM project_feedback f JOIN users u ON u.id = f.author_id WHERE f.project_id = ? ORDER BY f.created_at`
      ).all(p.id) as unknown as { id: number; body: string; name: string; role: string; created_at: string }[])
    : [];
  const applications = isOwner
    ? (await db.prepare(
        `SELECT pa.*, u.name, u.role FROM project_applications pa JOIN users u ON u.id = pa.user_id
         WHERE pa.project_id = ? AND pa.status = 'pending' ORDER BY pa.created_at`
      ).all(p.id) as unknown as { id: number; user_id: number; name: string; role: string; message: string }[])
    : [];
  const myApplication = user && !isOwner
    ? (await db.prepare("SELECT status FROM project_applications WHERE project_id = ? AND user_id = ?").get(p.id, user.id) as { status: string } | undefined)
    : undefined;
  const full = p.slots !== null && participants.length >= p.slots;
  const vis = projectVisibility(p);
  const invitedMe = !!user && !isOwner && !!(await db.prepare(
    `SELECT 1 FROM project_mentor_invites WHERE project_id = ? AND mentor_id = ?
     UNION SELECT 1 FROM project_member_invites WHERE project_id = ? AND user_id = ?`
  ).get(p.id, user.id, p.id, user.id));
  const pendingMentorInvites = isOwner
    ? (await db.prepare(
        `SELECT u.id, u.name FROM project_mentor_invites i JOIN users u ON u.id = i.mentor_id WHERE i.project_id = ? ORDER BY u.name`
      ).all(p.id) as unknown as { id: number; name: string }[])
    : [];
  const invitableMentors = isOwner
    ? (await db.prepare(
        "SELECT id, name, headline FROM users WHERE role = 'mentor' AND account_status = 'active' AND id != ? ORDER BY name"
      ).all(user!.id) as unknown as { id: number; name: string; headline: string }[])
        .filter((m) => !grantedMentors.some((g) => g.id === m.id) && !pendingMentorInvites.some((x) => x.id === m.id))
    : [];
  const pendingMemberInvites = isOwner
    ? (await db.prepare(
        `SELECT u.id, u.name FROM project_member_invites i JOIN users u ON u.id = i.user_id WHERE i.project_id = ? ORDER BY u.name`
      ).all(p.id) as unknown as { id: number; name: string }[])
    : [];
  const invitableMembers = isOwner
    ? (await db.prepare(
        `SELECT id, name, headline FROM users WHERE role = 'mentee' AND account_status = 'active' AND id != ?
           AND id NOT IN (SELECT user_id FROM project_applications WHERE project_id = ? AND status = 'accepted') ORDER BY name`
      ).all(user!.id, p.id) as unknown as { id: number; name: string; headline: string }[])
        .filter((m) => !pendingMemberInvites.some((x) => x.id === m.id))
    : [];

  return (
    <div className="grid gap-8 py-10 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <Link href="/projetos" className="text-sm text-muted hover:text-fg">← Projetos</Link>
        <Flash params={sp} />
        <div>
          <div className="flex flex-wrap gap-1.5">
            <Badge kind={p.kind === "open_source" ? "open_source" : "projeto"} label={PROJECT_KINDS[p.kind]} />
            <Badge kind={p.status === "aberto" ? "active" : "pending"} label={PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? p.status} />
            <Badge kind={vis === "open" ? "open_source" : "projeto"} label={vis === "open" ? "Contribuicao livre" : PROJECT_VISIBILITY[vis].label} />
          </div>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{p.title}</h1>
          <p className="mt-2 text-sm text-muted">
            Por <Link href={`/pessoas/${owner.id}`} className="text-accent hover:underline">{owner.name}</Link> ({ROLE_LABELS[owner.role]})
          </p>
          {user && user.id !== owner.id && <div className="mt-2"><ReportForm type="project" id={p.id} ret={`/projetos/${p.id}`} label="Denunciar projeto" /></div>}
        </div>
        {p.summary && <p className="text-lg text-fg/90">{p.summary}</p>}
        <p className="whitespace-pre-line leading-relaxed text-muted">{p.description}</p>
        {p.goals && <div><h2 className="font-semibold">Objetivos de aprendizado</h2><p className="mt-1 text-sm text-muted">{p.goals}</p></div>}
        {p.help_needed && <div><h2 className="font-semibold">Ajuda necessaria</h2><p className="mt-1 text-sm text-muted">{p.help_needed}</p></div>}
        <SkillChips skills={p.tools} />

        {canComment && (
          <section aria-labelledby="feedback">
            <h2 id="feedback" className="text-xl font-semibold">Feedback e comentarios</h2>
            <ul className="mt-3 space-y-3">
              {feedback.length === 0 && <Empty>Nenhum comentario ainda.</Empty>}
              {feedback.map((f) => (
                <li key={f.id} className="rounded-md border border-line p-3">
                  <p className="text-xs text-muted">{f.name} · {ROLE_LABELS[f.role]} · {new Date(f.created_at + "Z").toLocaleDateString("pt-BR")}</p>
                  <p className="mt-1 text-sm">{f.body}</p>
                </li>
              ))}
            </ul>
            <form action={addProjectFeedback} className="mt-3 space-y-2">
              <input type="hidden" name="project_id" value={p.id} />
              <label className="block space-y-1 text-sm"><span>Novo comentario</span><textarea name="body" required rows={3} className={inputCls} /></label>
              <button className={btnSecondaryCls}>Publicar comentario</button>
            </form>
          </section>
        )}
        <section>
          <h2 className="font-semibold">Arquivos do projeto</h2>
          <p className="mt-1 text-xs text-muted">Quem cria o projeto e quem foi aceito nele podem anexar ate 10 arquivos. Eles aparecem para quem pode ver o projeto.</p>
          <AttachmentList items={projectFiles} showOwner reportFor={user?.id} ret={`/projetos/${p.id}`}
            removableIds={projectFiles.filter((a) => isOwner || a.owner_id === user?.id).map((a) => a.id)} />
          {canAttach && projectFiles.length < 10 && <UploadForm scope="project" targetId={p.id} />}
        </section>
      </div>

      <aside className="space-y-4">
        <Card className="space-y-2 text-sm">
          {[
            ["Nivel", p.difficulty], ["Oportunidade", p.opportunity_type], ["Modalidade", p.modality],
            ["Carga semanal", p.weekly_hours], ["Inicio", p.starts_on], ["Termino", p.ends_on], ["Areas", p.areas],
            ["Vagas", p.slots ? `${participants.length}/${p.slots} preenchidas` : ""],
          ].filter(([, v]) => v).map(([k, v]) => (
            <p key={k}><span className="text-muted">{k}:</span> {v}</p>
          ))}
          {p.repo_url && <a href={externalHref(p.repo_url)} target="_blank" rel="noreferrer" className="block text-accent hover:underline">Repositorio ↗</a>}
        </Card>

        {!isOwner && (
          <Card>
            {invitedMe ? (
              <div className="space-y-2 text-sm">
                <p>Voce recebeu um convite para este projeto.</p>
                <Link href="/meus-projetos" className={`${btnCls} w-full`}>Responder convite</Link>
              </div>
            ) : !user ? (
              <Link href="/login" className={`${btnCls} w-full`}>{vis === "open" ? "Entre para contribuir" : "Entre para participar"}</Link>
            ) : myApplication && myApplication.status !== "cancelled" && myApplication.status !== "rejected" ? (
              <div className="space-y-3">
                <Badge kind={myApplication.status === "accepted" ? "active" : "requested"} label={myApplication.status === "accepted" ? "Voce participa deste projeto" : "Candidatura enviada"} />
                <form action={cancelApplication}><input type="hidden" name="project_id" value={p.id} /><button className={`${btnSecondaryCls} w-full`}>Cancelar participacao</button></form>
              </div>
            ) : myApplication?.status === "rejected" ? (
              <p className="text-sm text-muted">Sua candidatura nao foi aceita desta vez.</p>
            ) : vis === "private" ? (
              <p className="text-sm text-muted">Projeto particular: a participacao e so por convite.</p>
            ) : p.status !== "aberto" || full ? (
              <p className="text-sm text-muted">{full ? "Vagas preenchidas." : "Este projeto nao esta recebendo inscricoes."}</p>
            ) : (
              <form action={applyToProject} className="space-y-2">
                <input type="hidden" name="project_id" value={p.id} />
                {vis === "open" && <p className="text-xs text-muted">Contribuicao livre: voce entra na hora e o responsavel e avisado.</p>}
                <label className="block space-y-1 text-sm"><span>{vis === "open" ? "O que voce pretende fazer? (opcional)" : "Por que voce quer participar? (opcional)"}</span><textarea name="message" rows={3} maxLength={1000} className={inputCls} /></label>
                <button className={`${btnCls} w-full`}>{vis === "open" ? "Contribuir" : "Candidatar-se"}</button>
              </form>
            )}
          </Card>
        )}

        {isOwner && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Gerenciar</h2>
            <form action={updateProjectStatus} className="flex gap-2">
              <input type="hidden" name="project_id" value={p.id} />
              <label className="sr-only" htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={p.status} className={inputCls}>
                {Object.entries(PROJECT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <button className={btnSecondaryCls}>Salvar</button>
            </form>
            <form action={updateProjectVisibility} className="flex gap-2">
              <input type="hidden" name="project_id" value={p.id} />
              <label className="sr-only" htmlFor="visibility">Visibilidade</label>
              <select id="visibility" name="visibility" defaultValue={vis} className={inputCls}>
                {Object.entries(PROJECT_VISIBILITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <button className={btnSecondaryCls}>Salvar</button>
            </form>
            <p className="text-xs text-muted">{PROJECT_VISIBILITY[vis].help}</p>
            <Link href={`/talentos?projeto=${p.id}`} className="block text-sm text-accent hover:underline">Buscar mentorados compativeis →</Link>
            <DeleteConfirm action={deleteProject} fields={{ project_id: p.id, return: `/projetos/${p.id}` }} label="Excluir projeto">
              O projeto, as candidaturas, os comentarios e os acessos de mentores serao apagados. Quem participa recebe um aviso.
            </DeleteConfirm>
          </Card>
        )}

        {isOwner && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Convidar mentores para ajudar</h2>
            <p className="text-xs text-muted">O mentor recebe um aviso e um e-mail e escolhe se aceita. Quem aceitar pode ver e comentar o projeto.</p>
            {grantedMentors.length > 0 && (
              <ul className="space-y-1 text-sm">{grantedMentors.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2">
                  <span>{m.name} <Badge kind="active" label="Ajudando" /></span>
                  <form action={revokeProjectAccess}>
                    <input type="hidden" name="project_id" value={p.id} /><input type="hidden" name="mentor_id" value={m.id} />
                    <button className="text-xs text-red-300 hover:underline">Remover</button>
                  </form>
                </li>
              ))}</ul>
            )}
            {pendingMentorInvites.length > 0 && (
              <ul className="space-y-1 text-sm">{pendingMentorInvites.map((m) => <li key={m.id} className="flex items-center justify-between gap-2">{m.name} <Badge kind="pending" label="Convite enviado" /></li>)}</ul>
            )}
            {invitableMentors.length > 0 ? (
              <form action={inviteProjectMentor} className="space-y-2">
                <input type="hidden" name="project_id" value={p.id} />
                <label className="sr-only" htmlFor="invite-mentor">Mentor</label>
                <select id="invite-mentor" name="mentor_id" required className={inputCls}>
                  {invitableMentors.map((m) => <option key={m.id} value={m.id}>{m.name}{m.headline ? ` — ${m.headline}` : ""}</option>)}
                </select>
                <textarea name="message" rows={2} maxLength={500} placeholder="Mensagem (opcional): como o mentor pode ajudar" className={inputCls} />
                <button className={`${btnSecondaryCls} w-full`}>Enviar convite</button>
              </form>
            ) : (
              <p className="text-xs text-muted">Todos os mentores disponiveis ja foram convidados.</p>
            )}
            <Link href="/mentores" className="block text-sm text-accent hover:underline">Ver perfis dos mentores →</Link>
          </Card>
        )}

        {isOwner && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Convidar mentorados para participar</h2>
            <>
                <p className="text-xs text-muted">A pessoa recebe um aviso e um e-mail e escolhe se aceita. Quem aceitar entra como participante.</p>
                {pendingMemberInvites.length > 0 && (
                  <ul className="space-y-1 text-sm">{pendingMemberInvites.map((m) => <li key={m.id} className="flex items-center justify-between gap-2">{m.name} <Badge kind="pending" label="Convite enviado" /></li>)}</ul>
                )}
                {invitableMembers.length > 0 ? (
                  <form action={inviteProjectMember} className="space-y-2">
                    <input type="hidden" name="project_id" value={p.id} />
                    <label className="sr-only" htmlFor="invite-member">Mentorado</label>
                    <select id="invite-member" name="user_id" required className={inputCls}>
                      {invitableMembers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.headline ? ` — ${m.headline}` : ""}</option>)}
                    </select>
                    <textarea name="message" rows={2} maxLength={500} placeholder="Mensagem (opcional): o que a pessoa faria no projeto" className={inputCls} />
                    <button className={`${btnSecondaryCls} w-full`}>Enviar convite</button>
                  </form>
                ) : (
                  <p className="text-xs text-muted">Todos os mentorados disponiveis ja foram convidados ou participam.</p>
                )}
                <Link href="/talentos" className="block text-sm text-accent hover:underline">Ver perfis dos mentorados →</Link>
            </>
          </Card>
        )}


        {isOwner && (
          <Card className="space-y-3">
            <h2 className="font-semibold">Candidaturas ({applications.length})</h2>
            {applications.length === 0 && <Empty>Nenhuma candidatura pendente.</Empty>}
            {applications.map((a) => (
              <div key={a.id} className="rounded-md border border-line p-3 text-sm">
                <Link href={`/pessoas/${a.user_id}`} className="font-medium text-accent hover:underline">{a.name}</Link>
                {a.message && <p className="mt-1 text-xs text-muted">{a.message}</p>}
                <div className="mt-2 flex gap-2">
                  {(["accept", "reject"] as const).map((d) => (
                    <form key={d} action={reviewApplication}>
                      <input type="hidden" name="application_id" value={a.id} /><input type="hidden" name="decision" value={d} />
                      <button className={d === "accept" ? btnCls : btnSecondaryCls}>{d === "accept" ? "Aceitar" : "Recusar"}</button>
                    </form>
                  ))}
                </div>
              </div>
            ))}
            <h3 className="pt-2 text-sm font-semibold">Participantes ({participants.length})</h3>
            <ul className="space-y-1 text-sm text-muted">{participants.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2">
                <span>{x.name}</span>
                <form action={removeProjectParticipant}>
                  <input type="hidden" name="project_id" value={p.id} /><input type="hidden" name="user_id" value={x.id} />
                  <button className="text-xs text-red-300 hover:underline">Remover</button>
                </form>
              </li>
            ))}</ul>
          </Card>
        )}
      </aside>
    </div>
  );
}
