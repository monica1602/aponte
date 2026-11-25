import { externalHref } from "@/lib/url";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ReportForm } from "@/components/report-form";
import { AttachmentList, UploadForm } from "@/components/attachments";
import { listAttachments } from "@/lib/attachments";
import { eventReviewTarget, eventSummary, myReview, REVIEW_MIN_SHOW } from "@/lib/reviews";
import { getDb, type PlatformEvent } from "@/lib/db";
import { deleteEvent, requestEventAccess, updateEventConsents } from "@/lib/actions";
import { CancelRegistration, canCancelRegistration } from "@/components/cancel-registration";
import { DeleteConfirm } from "@/components/delete-confirm";
import { CancelEvent } from "@/components/cancel-event";
import { Badge, Card, Flash, btnCls, btnSecondaryCls } from "@/components/ui";
import { eventEnded } from "@/lib/event-time";
import { EventInvites, InviteNotice } from "@/components/event-invites";
import { myInvite } from "@/lib/event-invites";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evento — Ponte" };

const modalityLabel: Record<string, string> = { online: "Online", in_person: "Presencial", hybrid: "Hibrido" };
const regLabel: Record<string, string> = { approved: "Inscricao confirmada", requested: "Aguardando aprovacao", waitlist: "Lista de espera", declined: "Inscricao recusada", cancelled: "Inscricao cancelada" };

export default async function EventoPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string; q?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  const db = getDb();
  const e = await db
    .prepare(
      `SELECT e.*, u.name AS owner_name, u.role AS owner_role,
        (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id AND r.status = 'approved') AS approved,
        (SELECT COUNT(*) FROM event_registrations r WHERE r.event_id = e.id) + (SELECT COUNT(*) FROM certificates c WHERE c.event_id = e.id) AS history
       FROM events e JOIN users u ON u.id = e.owner_id WHERE e.id = ? AND e.status IN ('published','cancelled','draft')`
    )
    .get(Number(id)) as (PlatformEvent & { owner_name: string; owner_role: string; approved: number; history: number }) | undefined;
  if (!e || (e.status === "draft" && user?.id !== e.owner_id)) notFound();
  const draft = e.status === "draft";
  const rejected = e.approval_status === "rejected";
  const reg = user
    ? (await db.prepare("SELECT status, checked_in_at, communication_consent, image_consent FROM event_registrations WHERE event_id = ? AND user_id = ?").get(e.id, user.id) as { status: string; checked_in_at: string | null; communication_consent: number; image_consent: number } | undefined)
    : undefined;
  const cancelledEvent = e.status === "cancelled";
  if (cancelledEvent && user?.id !== e.owner_id && !reg) notFound();
  const registration = reg?.status === "cancelled" ? undefined : reg?.status;
  const canCancel = !!reg && canCancelRegistration({ ...reg, starts_at: e.starts_at, event_status: e.status });
  const full = e.capacity !== null && e.approved >= e.capacity;
  const ret = `/eventos/${e.id}`;
  const showLink = e.online_url && registration === "approved" && !cancelledEvent;

  const isOrganizer = user?.id === e.owner_id;
  const materials = isOrganizer || reg?.status === "approved" ? await listAttachments({ scope: "event_material", eventId: e.id }) : null;
  const canEvidence = reg?.status === "approved" && !!reg.checked_in_at;
  const evidence = isOrganizer ? await listAttachments({ scope: "event_evidence", eventId: e.id }) : canEvidence && user ? await listAttachments({ scope: "event_evidence", eventId: e.id, ownerId: user.id }) : null;
  const canReview = user ? !!(await eventReviewTarget(user.id, e.id)) : false;
  const reviewed = canReview && user ? !!(await myReview(user.id, "event", e.id)) : false;
  const summary = user?.id === e.owner_id ? await eventSummary(e.id) : null;
  const invite = user && !isOrganizer && !draft ? await myInvite(e.id, user.id) : null;
  const canInvite = isOrganizer && e.owner_role === "mentee" && !cancelledEvent && !rejected && !eventEnded(e.ends_at);
  return (
    <div className="mx-auto max-w-3xl py-10">
      <Link href="/eventos" className="text-sm text-muted hover:text-fg">← Eventos</Link>
      <Flash params={sp} />
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Badge kind={e.modality} label={modalityLabel[e.modality]} />
        {e.category && <Badge kind="projeto" label={e.category} />}
      </div>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">{e.title}</h1>
      {cancelledEvent && <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-300">Este evento foi cancelado pela organizacao.</p>}
      {draft && !rejected && <p className="mt-3 rounded-md border border-amber-400/30 bg-amber-400/5 px-3 py-2 text-sm text-amber-200">Este evento aguarda a aprovacao da administracao. So voce ve esta pagina. Os convites saem quando ele for aprovado.</p>}
      {rejected && <p className="mt-3 rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 text-sm text-red-300 [overflow-wrap:anywhere]">A administracao recusou este evento. Motivo: {e.approval_note}</p>}
      <p className="mt-2 text-sm text-muted">Organizado por {e.organizer || e.owner_name}</p>
      {user && user.id !== e.owner_id && <div className="mt-2"><ReportForm type="event" id={e.id} ret={`/eventos/${e.id}`} label="Denunciar evento" /></div>}
      <dl className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card><dt className="text-xs text-muted">Quando</dt><dd className="mt-1 text-sm">{new Date(e.starts_at).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })} ate {new Date(e.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</dd></Card>
        <Card><dt className="text-xs text-muted">Onde</dt><dd className="mt-1 text-sm">
          {e.location ? `${e.location}${e.city ? ` — ${e.city}${e.state ? `/${e.state}` : ""}` : ""}` : "Online"}
          {e.modality !== "in_person" && <span className="block text-xs text-muted">{showLink ? <a href={externalHref(e.online_url)} className="text-accent underline" target="_blank" rel="noreferrer">Link do encontro</a> : "O link online e liberado para inscricoes confirmadas."}</span>}
        </dd></Card>
        <Card><dt className="text-xs text-muted">Vagas</dt><dd className="mt-1 text-sm">{e.capacity ? `${e.approved}/${e.capacity} confirmadas` : "Sem limite"}</dd></Card>
        <Card><dt className="text-xs text-muted">Inscricao</dt><dd className="mt-1 text-sm">{e.require_approval ? "Sujeita a aprovacao do organizador" : "Confirmacao automatica"}</dd></Card>
      </dl>
      {e.description && <p className="mt-6 whitespace-pre-line leading-relaxed text-fg/85">{e.description}</p>}
      {canInvite && <EventInvites eventId={e.id} ownerId={e.owner_id} q={sp.q ?? ""} />}
      {user?.id === e.owner_id && !cancelledEvent && !rejected && !eventEnded(e.ends_at) && <Link href={`/meus-eventos/${e.id}/editar`} className={`${btnSecondaryCls} mt-8`}>Editar evento</Link>}
      {user?.id === e.owner_id && !cancelledEvent && Number(e.history) > 0 && <CancelEvent eventId={e.id} returnTo={ret} className="mt-8" />}
      {user?.id === e.owner_id && !cancelledEvent && Number(e.history) === 0 && (
        <DeleteConfirm action={deleteEvent} fields={{ event_id: e.id, return: ret }} label="Excluir evento" className="mt-8">
          O evento e as inscricoes serao apagados. As pessoas inscritas recebem um aviso de cancelamento.
        </DeleteConfirm>
      )}
      {materials && (isOrganizer || materials.length > 0) && (
        <Card className="mt-8">
          <h2 className="font-semibold">Materiais do evento</h2>
          <p className="mt-1 text-xs text-muted">{isOrganizer ? "Ate 10 arquivos. So as pessoas com inscricao confirmada veem." : "Materiais enviados pela organizacao para as pessoas inscritas."}</p>
          <AttachmentList items={materials} reportFor={user?.id} ret={ret} removableIds={isOrganizer ? materials.map((a) => a.id) : []} />
          {isOrganizer && materials.length < 10 && <UploadForm scope="event_material" targetId={e.id} label="Enviar material" />}
        </Card>
      )}
      {evidence && (isOrganizer ? evidence.length > 0 : true) && (
        <Card className="mt-8">
          <h2 className="font-semibold">{isOrganizer ? "Evidencias dos participantes" : "Minha evidencia"}</h2>
          <p className="mt-1 text-xs text-muted">{isOrganizer ? "Fotos ou prints enviados por quem fez check-in. So voce e quem enviou veem." : "Quem fez check-in pode enviar 1 foto ou print. So voce e a organizacao veem."}</p>
          <AttachmentList items={evidence} showOwner={isOrganizer} reportFor={user?.id} ret={ret} removableIds={evidence.filter((a) => a.owner_id === user?.id).map((a) => a.id)} empty="Nenhuma evidencia enviada." />
          {!isOrganizer && evidence.length === 0 && <UploadForm scope="event_evidence" targetId={e.id} label="Enviar evidencia" />}
        </Card>
      )}
      {canReview && (
        <Card className="mt-8">
          <h2 className="font-semibold">Avaliar este evento</h2>
          <p className="mt-1 text-sm text-muted">{reviewed ? "Voce ja avaliou este evento. Pode alterar a avaliacao ate 30 dias depois do fim." : "Voce participou deste evento. Conte como foi, ate 30 dias depois do fim."}</p>
          <Link href={`/avaliar?evento=${e.id}`} className={`${btnSecondaryCls} mt-3`}>{reviewed ? "Alterar minha avaliacao" : "Avaliar o evento"}</Link>
        </Card>
      )}
      {summary && (
        <Card className="mt-8">
          <h2 className="font-semibold">Avaliacoes do evento</h2>
          {summary.avg === null ? (
            <p className="mt-1 text-sm text-muted">O resultado aparece quando houver pelo menos {REVIEW_MIN_SHOW} avaliacoes (agora: {summary.count}). Os nomes de quem avaliou nunca aparecem.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted"><span className="text-lg font-semibold text-fg">{summary.avg.toLocaleString("pt-BR")} de 5</span> em {summary.count} avaliacoes. Os nomes de quem avaliou nao aparecem.</p>
              {summary.comments.length > 0 && <ul className="mt-3 space-y-2 text-sm">{summary.comments.map((c, i) => <li key={i} className="whitespace-pre-wrap rounded-lg bg-raised px-3 py-2 [overflow-wrap:anywhere]">{c}</li>)}</ul>}
            </>
          )}
        </Card>
      )}
      <div className="mt-8">
        {invite?.status === "pending" && !registration && !cancelledEvent && <InviteNotice eventId={e.id} inviter={invite.inviter} />}
        {!user ? (
          <Link href="/login" className={btnCls}>Entre para se inscrever</Link>
        ) : e.owner_id === user.id ? (
          <p className="text-sm text-muted">Voce organiza este evento. Gerencie as inscricoes em Meus eventos.</p>
        ) : cancelledEvent ? (
          reg ? <Badge kind={reg.status} label={regLabel[reg.status] ?? reg.status} /> : null
        ) : registration ? (
          <>
            <Badge kind={registration} label={regLabel[registration] ?? registration} />
            <form action={updateEventConsents} className="mt-4 space-y-2">
              <input type="hidden" name="event_id" value={e.id} />
              <p className="text-sm font-medium">Suas permissoes neste evento</p>
              <label className="flex items-start gap-2 text-sm text-muted"><input name="communications" type="checkbox" defaultChecked={Boolean(reg!.communication_consent)} className="mt-1" />Quero receber comunicacoes sobre eventos (opcional).</label>
              <label className="flex items-start gap-2 text-sm text-muted"><input name="image" type="checkbox" defaultChecked={Boolean(reg!.image_consent)} className="mt-1" />Autorizo uso de imagem deste evento (opcional).</label>
              <button className={btnSecondaryCls}>Salvar permissoes</button>
            </form>
            {canCancel && <CancelRegistration eventId={e.id} className="mt-6" />}
          </>
        ) : (
          <form action={requestEventAccess} className="space-y-2">
            {reg?.status === "cancelled" && <p className="text-sm text-muted"><Badge kind="cancelled" label={regLabel.cancelled} /> Voce pode se inscrever de novo.</p>}
            <input type="hidden" name="event_id" value={e.id} />
            <input type="hidden" name="return" value={ret} />
            <label className="flex items-start gap-2 text-sm text-muted"><input name="lgpd" type="checkbox" required className="mt-1" />Li o <Link href="/privacidade" className="text-accent underline">aviso de privacidade</Link> e autorizo o uso dos meus dados para gerir esta inscricao.</label>
            <label className="flex items-start gap-2 text-sm text-muted"><input name="communications" type="checkbox" className="mt-1" />Quero receber comunicacoes sobre eventos (opcional).</label>
            <label className="flex items-start gap-2 text-sm text-muted"><input name="image" type="checkbox" className="mt-1" />Autorizo uso de imagem deste evento (opcional).</label>
            <button className={btnCls}>{full ? "Entrar na lista de espera" : "Solicitar inscricao"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
