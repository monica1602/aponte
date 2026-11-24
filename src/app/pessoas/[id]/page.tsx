import Link from "next/link";
import { notFound } from "next/navigation";
import { canSeeEmail, getDb, getProfile, getUser } from "@/lib/db";
import { personalImpact } from "@/lib/impact";
import { ImpactGrid } from "@/components/impact";
import { getSessionUser } from "@/lib/auth";
import { blockUser, inviteToCompany, requestMentorship, sendMessage, toggleEndorsement } from "@/lib/actions";
import { blockedBetween, hasBlocked } from "@/lib/moderation";
import { ReportForm } from "@/components/report-form";
import { AttachmentList } from "@/components/attachments";
import { canSeeResume, listAttachments } from "@/lib/attachments";
import { MESSAGE_MAX, canMessageDirect, conversationBetween } from "@/lib/messages";
import { Badge, Card, Empty, Flash, SkillChips, TYPE_LABELS, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";

type ContributionRow = {
  id: number;
  title: string;
  url: string;
  type: string;
  description: string;
  created_at: string;
  endorsers: string | null;
  endorsedByMe: number;
};

export default async function PessoaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const profile = await getUser(Number(id));
  if (!profile) notFound();
  const viewer = await getSessionUser();
  if (profile.account_status === "suspended" && viewer?.id !== profile.id) notFound();
  if (!profile.public_profile_consent && viewer?.id !== profile.id) notFound();
  const db = getDb();
  const ret = `/pessoas/${profile.id}`;
  const showEmail = await canSeeEmail(viewer?.id ?? null, profile);
  const impact = (await getProfile(profile.id)).show_impact ? await personalImpact(profile.id, profile.role) : null;
  const resume = await listAttachments({ scope: "resume", ownerId: profile.id });
  const showResume = resume.length > 0 && (viewer?.id === profile.id || (await canSeeResume(viewer?.id ?? null, profile)));
  const files = await listAttachments({ scope: "profile", ownerId: profile.id });

  const isMentorSide = profile.role === "mentor" || profile.role === "company";

  const contributions = await db
    .prepare(
      `SELECT c.*,
         (SELECT GROUP_CONCAT(u.name, ' & ') FROM endorsements e JOIN users u ON u.id = e.mentor_id WHERE e.contribution_id = c.id) AS endorsers,
         EXISTS(SELECT 1 FROM endorsements e WHERE e.contribution_id = c.id AND e.mentor_id = ?) AS "endorsedByMe"
       FROM contributions c WHERE c.user_id = ? ORDER BY c.created_at DESC`
    )
    .all(viewer?.id ?? 0, profile.id) as unknown as ContributionRow[];

  const network = await db
    .prepare(
      `SELECT u.id, u.name, u.headline FROM mentorships m
       JOIN users u ON u.id = m.mentee_id
       WHERE m.mentor_id = ? AND m.status = 'active' AND u.public_profile_consent = 1 ORDER BY u.name`
    )
    .all(profile.id) as unknown as { id: number; name: string; headline: string }[];

  const opportunities = await db
    .prepare("SELECT * FROM opportunities WHERE owner_id = ? ORDER BY created_at DESC")
    .all(profile.id) as unknown as {
    id: number;
    type: string;
    title: string;
    description: string;
  }[];

  let myLink: { status: string } | undefined;
  let companyLink: { status: string } | undefined;
  const companyCanInvite = viewer?.role === "company" && (profile.role === "mentor" || profile.role === "mentee");
  if (companyCanInvite) {
    companyLink = (await db
      .prepare("SELECT status FROM company_links WHERE company_id = ? AND member_id = ?")
      .get(viewer!.id, profile.id)) as { status: string } | undefined;
  }
  let canEndorse = false;
  if (viewer) {
    if (viewer.role === "mentee" && isMentorSide) {
      myLink = await db
        .prepare("SELECT status FROM mentorships WHERE mentor_id = ? AND mentee_id = ?")
        .get(profile.id, viewer.id) as { status: string } | undefined;
    }
    if ((viewer.role === "mentor" || viewer.role === "company") && profile.role === "mentee") {
      canEndorse = !!await db
        .prepare(
          "SELECT 1 FROM mentorships WHERE mentor_id = ? AND mentee_id = ? AND status = 'active'"
        )
        .get(viewer.id, profile.id);
    }
  }

  const canContact = !!viewer && viewer.id !== profile.id && profile.account_status === "active";
  const existing = canContact ? await conversationBetween(viewer!.id, profile.id) : undefined;
  const conversation = existing?.status === "declined" && existing.requested_by !== viewer?.id ? undefined : existing;
  const direct = canContact ? await canMessageDirect(viewer!.id, profile.id) : false;
  const otherViewer = !!viewer && viewer.id !== profile.id;
  const iBlocked = otherViewer ? await hasBlocked(viewer!.id, profile.id) : false;
  const blocked = otherViewer ? await blockedBetween(viewer!.id, profile.id) : false;
  const contactDeclined = conversation?.status === "declined" && conversation.requested_by === viewer?.id && !direct;

  return (
    <div className="space-y-6">
      <Flash params={sp} />
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{profile.name}</h1>
              <Badge kind={profile.role} />
            </div>
            <p className="mt-1 text-muted">{profile.headline}</p>
          </div>
          {viewer?.role === "mentee" &&
            isMentorSide &&
            (myLink?.status === "active" ? (
              <Badge kind="active" label="Na sua rede" />
            ) : myLink?.status === "pending" ? (
              <Badge kind="pending" label="Solicitacao enviada" />
            ) : (
              <form action={requestMentorship}>
                <input type="hidden" name="mentor_id" value={profile.id} />
                <input type="hidden" name="return" value={ret} />
                <button className={btnCls}>Solicitar mentoria</button>
              </form>
            ))}
          {companyCanInvite &&
            (companyLink?.status === "active" ? (
              <Badge kind="active" label="Na rede da empresa" />
            ) : companyLink?.status === "pending" ? (
              <Badge kind="pending" label="Convite enviado" />
            ) : (
              <form action={inviteToCompany} className="w-full max-w-xs space-y-2">
                <input type="hidden" name="member_id" value={profile.id} />
                <input type="hidden" name="return" value={ret} />
                <textarea name="message" rows={2} maxLength={1000} placeholder="Mensagem para a pessoa (opcional)" aria-label="Mensagem do convite" className={inputCls} />
                <button className={`${btnCls} w-full`}>Convidar para a rede da empresa</button>
              </form>
            ))}
        </div>
        {profile.bio && <p className="mt-4 text-sm text-fg/85">{profile.bio}</p>}
        <div className="mt-4">
          <SkillChips skills={profile.skills} />
        </div>
        {viewer && (
          <p className="mt-4 text-sm text-muted">
            {showEmail
              ? <>Contato: <span className="font-mono">{profile.email}</span></>
              : "O contato aparece quando voces tiverem uma mentoria, um vinculo ou um projeto ativo."}
          </p>
        )}
        {otherViewer && (
          <div className="mt-3 flex flex-wrap items-start gap-4">
            <form action={blockUser}>
              <input type="hidden" name="user_id" value={profile.id} />
              <input type="hidden" name="return" value={ret} />
              <button name="decision" value={iBlocked ? "unblock" : "block"} className="cursor-pointer text-xs text-muted hover:text-red-300">{iBlocked ? "Desbloquear" : "Bloquear"}</button>
            </form>
            <ReportForm type="user" id={profile.id} ret={ret} />
          </div>
        )}
        {iBlocked && <p className="mt-2 text-xs text-muted">Voce bloqueou esta pessoa. Ela nao pode enviar mensagens, pedidos de contato nem convites para voce.</p>}
        {canContact && !blocked && (
          <div className="mt-3">
            {contactDeclined ? (
              <Badge kind="pending" label="Pedido de contato nao aceito" />
            ) : conversation ? (
              <Link href={`/mensagens?c=${conversation.id}`} className={btnSecondaryCls}>Abrir conversa</Link>
            ) : (
              <details>
                <summary className={`${btnSecondaryCls} cursor-pointer list-none`}>{direct ? "Enviar mensagem" : "Pedir contato"}</summary>
                <form action={sendMessage} className="mt-3 max-w-lg space-y-2">
                  <input type="hidden" name="to" value={profile.id} />
                  <textarea name="body" required rows={3} maxLength={MESSAGE_MAX} aria-label="Mensagem" className={inputCls}
                    placeholder={direct ? "Escreva sua mensagem" : "Conte quem voce e e por que quer conversar"} />
                  <p className="text-xs text-muted">
                    {direct ? "A mensagem fica em Mensagens. O seu e-mail nao aparece." : "A pessoa recebe o pedido com esta mensagem e decide se aceita conversar. O seu e-mail nao aparece."}
                  </p>
                  <button className={btnCls}>{direct ? "Enviar mensagem" : "Enviar pedido de contato"}</button>
                </form>
              </details>
            )}
          </div>
        )}
      </Card>

      {impact && (
        <Card>
          <h2 className="font-semibold">Impacto na Ponte</h2>
          <ImpactGrid items={impact} />
        </Card>
      )}

      {(files.length > 0 || resume.length > 0) && (
        <Card>
          <h2 className="font-semibold">Curriculo e arquivos</h2>
          {resume.length > 0 && (showResume
            ? <AttachmentList items={resume} reportFor={viewer?.id} ret={ret} />
            : <p className="mt-2 text-sm text-muted">O curriculo aparece quando voces tiverem uma mentoria, um vinculo ou um projeto ativo.</p>)}
          {files.length > 0 && <AttachmentList items={files} reportFor={viewer?.id} ret={ret} />}
        </Card>
      )}

      {profile.role === "mentee" && (
        <Card>
          <h2 className="font-semibold">Contribuicoes</h2>
          {contributions.length === 0 ? (
            <div className="mt-2">
              <Empty>Nenhuma contribuicao publicada ainda.</Empty>
            </div>
          ) : (
            <ul className="mt-4 space-y-4">
              {contributions.map((c) => (
                <li key={c.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                      <Badge kind={c.type} label={TYPE_LABELS[c.type] ?? c.type} />{" "}
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                          {c.title} ↗
                        </a>
                      ) : (
                        c.title
                      )}
                    </span>
                    {canEndorse && (
                      <form action={toggleEndorsement}>
                        <input type="hidden" name="contribution_id" value={c.id} />
                        <input type="hidden" name="return" value={ret} />
                        <button
                          className={`rounded-lg px-3 py-1 text-xs font-medium cursor-pointer ${
                            c.endorsedByMe
                              ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-300 hover:bg-emerald-400/20"
                              : "border border-line text-muted hover:text-fg hover:bg-raised"
                          }`}
                        >
                          {c.endorsedByMe ? "✓ Recomendado" : "Recomendar"}
                        </button>
                      </form>
                    )}
                  </div>
                  {c.description && <p className="mt-1 text-sm text-muted">{c.description}</p>}
                  {c.endorsers && (
                    <p className="mt-1 text-xs font-medium text-emerald-400">
                      Recomendado por {c.endorsers}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {isMentorSide && (
        <>
          <Card>
            <h2 className="font-semibold">Rede de mentorados ({network.length})</h2>
            {network.length === 0 ? (
              <div className="mt-2">
                <Empty>Nenhum mentorado ativo ainda.</Empty>
              </div>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {network.map((n) => (
                  <li key={n.id}>
                    <Link href={`/pessoas/${n.id}`} className="font-medium text-accent hover:underline">
                      {n.name}
                    </Link>
                    <p className="text-xs text-muted">{n.headline}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {opportunities.length > 0 && (
            <Card>
              <h2 className="font-semibold">Oportunidades publicadas</h2>
              <ul className="mt-3 space-y-2">
                {opportunities.map((o) => (
                  <li key={o.id} className="text-sm">
                    <Badge kind={o.type} label={TYPE_LABELS[o.type]} />{" "}
                    <span className="font-medium">{o.title}</span>
                    {o.description && <p className="mt-0.5 text-muted">{o.description}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
