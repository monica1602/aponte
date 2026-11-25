import { declineEventInvite, inviteToEvent } from "@/lib/actions";
import { INVITE_MAX, listInvites, searchInvitees } from "@/lib/event-invites";
import { ROLE_PT } from "@/lib/admin-alert";
import { Card, btnSecondaryCls, inputCls } from "@/components/ui";

function inviteState(i: { status: string; sent_at: string | null; registered: number }): string {
  if (Number(i.registered) > 0) return "inscrito";
  if (i.status === "declined") return "recusou";
  return i.sent_at ? "convite enviado" : "sai quando o evento for aprovado";
}

/** Organizador (mentorado) convida pessoas cadastradas pelo nome. */
export async function EventInvites({ eventId, ownerId, q }: { eventId: number; ownerId: number; q: string }) {
  const invites = await listInvites(eventId);
  const results = await searchInvitees(eventId, ownerId, q);
  return (
    <Card className="mt-8">
      <h2 className="font-semibold">Convidar pessoas <span className="text-sm font-normal text-muted">({invites.length}/{INVITE_MAX})</span></h2>
      <p className="mt-1 text-xs text-muted">Busque pessoas cadastradas pelo nome. Quem for convidado recebe um aviso e decide se quer se inscrever.</p>
      {invites.length < INVITE_MAX && (
        <form method="get" className="mt-3 flex gap-2">
          <input name="q" defaultValue={q} minLength={2} placeholder="Nome da pessoa" aria-label="Nome da pessoa" className={inputCls} />
          <button className={btnSecondaryCls}>Buscar</button>
        </form>
      )}
      {q.trim().length >= 2 && (results.length === 0 ? <p className="mt-2 text-sm text-muted">Ninguem encontrado com esse nome.</p> : (
        <ul className="mt-3 space-y-2">{results.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg bg-raised px-3 py-2 text-sm">
            <span className="[overflow-wrap:anywhere]">{r.name} <span className="text-xs text-muted">· {ROLE_PT[r.role] ?? r.role}</span></span>
            <form action={inviteToEvent}><input type="hidden" name="event_id" value={eventId} /><input type="hidden" name="user_id" value={r.id} /><button className="text-xs text-accent hover:underline">Convidar</button></form>
          </li>
        ))}</ul>
      ))}
      {invites.length > 0 && (
        <ul className="mt-4 space-y-1 border-t border-line pt-3 text-sm">{invites.map((i) => (
          <li key={i.user_id} className="flex justify-between gap-3"><span className="[overflow-wrap:anywhere]">{i.name} <span className="text-xs text-muted">· {ROLE_PT[i.role] ?? i.role}</span></span><span className="shrink-0 text-xs text-muted">{inviteState(i)}</span></li>
        ))}</ul>
      )}
    </Card>
  );
}

export function InviteNotice({ eventId, inviter }: { eventId: number; inviter: string }) {
  return (
    <div className="mb-4 rounded-md border border-accent/40 bg-accent/5 px-3 py-2 text-sm">
      <p>{inviter} convidou voce para este evento.</p>
      <form action={declineEventInvite} className="mt-1"><input type="hidden" name="event_id" value={eventId} /><button className="text-xs text-muted hover:text-red-300">Recusar convite</button></form>
    </div>
  );
}
