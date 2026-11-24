import { Badge, ROLE_LABELS } from "./ui";
import { cancelMentorshipMeeting, completeMentorshipMeeting, confirmMentorshipMeeting, rescheduleMentorshipMeeting, scheduleMentorshipMeeting } from "@/lib/actions";
import { MEETING_LABEL, canConfirmMeeting, meetingStarted, meetingState, meetingTime, type Meeting, type MeetingKind } from "@/lib/meetings";

const STATE_BADGE = { pending: "requested", confirmed: "approved", completed: "active", cancelled: "cancelled" } as const;
const field = "rounded-md border border-line bg-raised px-2 py-1 text-sm";

/** Um encontro de mentoria com a situacao e as acoes de quem esta vendo. */
export function MeetingItem({ m, userId, returnTo }: { m: Meeting; userId: number; returnTo: string }) {
  const state = meetingState(m);
  const open = m.status === "scheduled";
  const hidden = <><input type="hidden" name="kind" value={m.kind} /><input type="hidden" name="meeting_id" value={m.id} /><input type="hidden" name="return" value={returnTo} /></>;
  return (
    <li className="rounded-xl border border-line p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span><span className="font-medium">{meetingTime(m.scheduled_at)}</span> · {m.duration_minutes} min · com {m.other_name} · {ROLE_LABELS[m.other_role] ?? m.other_role}</span>
        <Badge kind={STATE_BADGE[state]} label={MEETING_LABEL[state]} />
      </div>
      {state === "pending" && !canConfirmMeeting(m, userId) && <p className="mt-1 text-xs text-muted">Aguardando a resposta de {m.other_name}.</p>}
      {open && (
        <div className="mt-2 flex flex-wrap items-start gap-3 text-xs">
          {canConfirmMeeting(m, userId) && <form action={confirmMentorshipMeeting}>{hidden}<button className="rounded-md bg-emerald-500 px-3 py-1.5 font-semibold text-ink hover:bg-emerald-400">Aceitar</button></form>}
          {meetingStarted(m.scheduled_at) && <form action={completeMentorshipMeeting}>{hidden}<button className="rounded-md bg-cyan-500 px-3 py-1.5 font-semibold text-ink hover:bg-cyan-400">Marcar como concluido</button></form>}
          <details>
            <summary className="cursor-pointer py-1.5 text-accent">Reagendar</summary>
            <form action={rescheduleMentorshipMeeting} className="mt-2 flex flex-wrap items-center gap-2">
              {hidden}
              <input name="scheduled_at" type="datetime-local" required defaultValue={m.scheduled_at.slice(0, 16)} className={field} />
              <input name="duration_minutes" type="number" min="15" max="480" defaultValue={m.duration_minutes} className={`${field} w-20`} />
              <button className="rounded-md border border-line px-3 py-1 hover:bg-raised">Salvar nova data</button>
            </form>
          </details>
          <details>
            <summary className="cursor-pointer py-1.5 text-red-300">Cancelar encontro</summary>
            <form action={cancelMentorshipMeeting} data-no-keep className="mt-2 space-y-2">
              {hidden}
              <p className="text-muted">O encontro fica no historico como cancelado, e {m.other_name} recebe um aviso.</p>
              <label className="flex items-center gap-2 text-muted"><input type="checkbox" name="confirm" value="1" required /> Confirmo que quero cancelar este encontro.</label>
              <button className="rounded-md bg-red-500 px-3 py-1.5 font-semibold text-white hover:bg-red-600">Cancelar encontro</button>
            </form>
          </details>
        </div>
      )}
    </li>
  );
}

/** Encontros em aberto com uma pessoa e o quadro para pedir um novo. */
export function PersonMeetings({ meetings, kind, linkId, userId, returnTo }: { meetings: Meeting[]; kind: MeetingKind; linkId: number; userId: number; returnTo: string }) {
  const open = meetings.filter((m) => m.kind === kind && m.link_id === linkId && m.status === "scheduled");
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Encontros</h3><a href="/encontros" className="text-xs text-accent hover:underline">Historico →</a></div>
      {open.length === 0 ? <p className="mt-1 text-xs text-muted">Nenhum encontro marcado.</p> : <ul className="mt-2 space-y-2">{open.map((m) => <MeetingItem key={`${m.kind}-${m.id}`} m={m} userId={userId} returnTo={returnTo} />)}</ul>}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-accent">Solicitar encontro</summary>
        <form action={scheduleMentorshipMeeting} className="mt-2 flex flex-wrap items-center gap-2">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="link_id" value={linkId} /><input type="hidden" name="return" value={returnTo} />
          <input name="scheduled_at" type="datetime-local" required className={field} />
          <input name="duration_minutes" type="number" min="15" max="480" defaultValue="60" className={`${field} w-20`} />
          <button className="rounded-md bg-accent px-3 py-1 font-semibold text-ink hover:opacity-90">Solicitar</button>
        </form>
      </details>
    </div>
  );
}
