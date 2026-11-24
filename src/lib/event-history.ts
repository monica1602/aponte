import { getDb } from "./db";

/** Evento com inscricoes ou certificados nao e apagado: ele e cancelado. */
export async function eventHasHistory(eventId: number): Promise<boolean> {
  const row = (await getDb().prepare(
    `SELECT (SELECT COUNT(*) FROM event_registrations WHERE event_id = ?) + (SELECT COUNT(*) FROM certificates WHERE event_id = ?) AS count`
  ).get(eventId, eventId)) as { count: number };
  return Number(row.count) > 0;
}
