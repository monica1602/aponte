import { cancelEventRegistration } from "@/lib/actions";
import { eventStarted } from "@/lib/event-time";

type Reg = { status: string; checked_in_at: string | null; starts_at: string; event_status: string };

export function canCancelRegistration(r: Reg): boolean {
  return r.event_status === "published" && ["requested", "approved", "waitlist"].includes(r.status) && !r.checked_in_at && !eventStarted(r.starts_at);
}

/** Cancelamento da inscricao com confirmacao, ate o inicio do evento. */
export function CancelRegistration({ eventId, returnTo = "", label = "Cancelar minha inscricao", className = "" }: {
  eventId: number; returnTo?: string; label?: string; className?: string;
}) {
  return (
    <details className={`rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 ${className}`}>
      <summary className="cursor-pointer text-sm font-semibold text-red-300">{label}</summary>
      <form action={cancelEventRegistration} data-no-keep className="mt-3 space-y-3">
        <input type="hidden" name="event_id" value={eventId} />
        {returnTo && <input type="hidden" name="return" value={returnTo} />}
        <p className="text-sm text-muted">Sua vaga fica livre para a proxima pessoa da lista de espera. Voce pode se inscrever de novo depois, seguindo as regras de vagas do evento.</p>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="confirm" value="1" required /> Confirmo que quero cancelar minha inscricao.
        </label>
        <button className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">Cancelar inscricao</button>
      </form>
    </details>
  );
}
