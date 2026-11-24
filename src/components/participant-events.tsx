import Link from "next/link";
import { getDb } from "@/lib/db";
import { Badge, Card, Empty } from "./ui";
import { CancelRegistration, canCancelRegistration } from "./cancel-registration";
import { PresenceActions, type PresenceReg } from "./presence-actions";

export const REGISTRATION_STATUS: Record<string, string> = { approved: "Confirmada", requested: "Aguardando aprovacao", waitlist: "Lista de espera", declined: "Recusada", cancelled: "Cancelada" };

type Row = PresenceReg & { event_id: number; title: string };

/** Inscricoes da pessoa em eventos de outras pessoas, com os botoes de presenca e de cancelamento. */
export async function ParticipantEvents({ userId, returnTo }: { userId: number; returnTo: string }) {
  const rows = (await getDb().prepare(
    `SELECT r.id, r.event_id, r.status, r.checked_in_at, r.checked_out_at, r.safe_home_at,
            e.title, e.starts_at, e.ends_at, e.modality, e.status AS event_status
     FROM event_registrations r JOIN events e ON e.id = r.event_id WHERE r.user_id = ? ORDER BY e.starts_at DESC`
  ).all(userId)) as unknown as Row[];
  if (rows.length === 0) return <Empty>Voce ainda nao se inscreveu em eventos. <Link href="/eventos" className="text-accent underline">Ver eventos</Link></Empty>;
  return (
    <ul className="space-y-2">
      {rows.map((e) => (
        <li key={e.id}><Card className="py-3">
          <div className="flex items-center justify-between gap-3">
            <Link href={`/eventos/${e.event_id}`} className="text-accent hover:underline">{e.title}</Link>
            <span className="flex gap-1.5">
              {e.event_status === "cancelled" && <Badge kind="cancelled" label="Evento cancelado" />}
              <Badge kind={e.status} label={REGISTRATION_STATUS[e.status] ?? e.status} />
            </span>
          </div>
          <PresenceActions r={e} returnTo={returnTo} />
          {canCancelRegistration(e) && <CancelRegistration eventId={e.event_id} returnTo={returnTo} label="Cancelar inscricao" className="mt-3" />}
        </Card></li>
      ))}
    </ul>
  );
}
