import { deleteEvent } from "@/lib/actions";

/** Cancelamento de evento com historico: o evento e as inscricoes ficam guardados. */
export function CancelEvent({ eventId, returnTo, className = "" }: { eventId: number; returnTo: string; className?: string }) {
  return (
    <details className={`rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 ${className}`}>
      <summary className="cursor-pointer text-sm font-semibold text-red-300">Cancelar evento</summary>
      <form action={deleteEvent} data-no-keep className="mt-3 space-y-3">
        <input type="hidden" name="event_id" value={eventId} />
        <input type="hidden" name="return" value={returnTo} />
        <p className="text-sm text-muted">O evento sai da agenda e nao aceita mais inscricoes, check-in nem certificados novos. As inscricoes, as presencas e os certificados ja emitidos ficam guardados. As pessoas inscritas recebem um aviso de cancelamento.</p>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="confirm" value="1" required /> Confirmo que quero cancelar este evento.
        </label>
        <button className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">Cancelar evento</button>
      </form>
    </details>
  );
}
