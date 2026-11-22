import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { PROJECT_KINDS, PROJECT_STATUS } from "@/lib/catalog";
import { listOwnProjects, listParticipating, listSharedWithMentor } from "@/lib/projects";
import { DeleteConfirm } from "@/components/delete-confirm";
import { deleteProject, respondProjectMentorInvite } from "@/lib/edu-actions";
import { getDb } from "@/lib/db";
import { Badge, Card, Empty, Flash, PageHeader, btnCls, btnSecondaryCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus projetos — Ponte" };

export default async function MeusProjetosPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const own = await listOwnProjects(user.id);
  const participating = await listParticipating(user.id);
  const shared = user.role === "mentor" ? await listSharedWithMentor(user.id) : [];
  const invites = user.role === "mentor"
    ? ((await getDb().prepare(
        `SELECT i.id, i.message, p.title, p.summary, u.name AS owner_name, u.id AS owner_id FROM project_mentor_invites i
         JOIN projects p ON p.id = i.project_id JOIN users u ON u.id = p.owner_id WHERE i.mentor_id = ? ORDER BY i.created_at DESC`
      ).all(user.id)) as unknown as { id: number; message: string; title: string; summary: string; owner_name: string; owner_id: number }[])
    : [];
  const section = (title: string, items: { id: number; title: string; kind: string; tag: string }[], empty: string, deletable = false) => (
    <section className="mb-8">
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {items.length === 0 ? <Empty>{empty}</Empty> : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <li key={p.id}>
              <Card>
                <Link href={`/projetos/${p.id}`} className="font-semibold text-accent hover:underline">{p.title}</Link>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge kind="projeto" label={PROJECT_KINDS[p.kind as keyof typeof PROJECT_KINDS] ?? p.kind} />
                  <Badge kind="pending" label={p.tag} />
                </div>
                {deletable && (
                  <DeleteConfirm action={deleteProject} fields={{ project_id: p.id, return: "/meus-projetos" }} label="Excluir projeto" className="mt-3">
                    O projeto e tudo ligado a ele serao apagados. Quem participa recebe um aviso.
                  </DeleteConfirm>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Minha conta" title={user.role === "mentor" ? "Projetos mentorados" : user.role === "mentee" ? "Projetos proprios" : "Meus projetos"} />
      <Flash params={sp} />
      <Link href="/projetos/novo" className={`${btnCls} mb-8`}>Criar projeto</Link>
      {invites.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">Convites para ajudar em projetos ({invites.length})</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {invites.map((i) => (
              <li key={i.id}>
                <Card>
                  <p className="font-semibold">{i.title}</p>
                  <p className="mt-1 text-xs text-muted">Convite de <Link href={`/pessoas/${i.owner_id}`} className="text-accent hover:underline">{i.owner_name}</Link></p>
                  {i.summary && <p className="mt-2 text-sm text-fg/85">{i.summary}</p>}
                  {i.message && <p className="mt-2 text-sm text-muted">&ldquo;{i.message}&rdquo;</p>}
                  <div className="mt-3 flex gap-2">
                    {(["accept", "reject"] as const).map((d) => (
                      <form key={d} action={respondProjectMentorInvite}>
                        <input type="hidden" name="invite_id" value={i.id} /><input type="hidden" name="decision" value={d} />
                        <button className={d === "accept" ? btnCls : btnSecondaryCls}>{d === "accept" ? "Aceitar" : "Recusar"}</button>
                      </form>
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {user.role === "mentor" && section("Projetos dos meus mentorados", shared.map((p) => ({ id: p.id, title: p.title, kind: p.kind, tag: p.owner_name })), "Nenhum mentorado compartilhou projetos com voce ainda.")}
      {section("Projetos que criei", own.map((p) => ({ id: p.id, title: p.title, kind: p.kind, tag: PROJECT_STATUS[p.status as keyof typeof PROJECT_STATUS] ?? p.status })), "Voce ainda nao criou projetos.", true)}
      {section("Projetos de que participo", participating.map((p) => ({ id: p.id, title: p.title, kind: p.kind, tag: p.application_status === "accepted" ? "Participante" : "Aguardando resposta" })), "Nenhuma participacao ainda.")}
    </div>
  );
}
