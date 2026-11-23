import { getDb } from "@/lib/db";
import { emailUser } from "@/lib/user-email";
import { runRetention } from "@/lib/retention";

const DAY_MS = 24 * 60 * 60 * 1000;

// Eventos guardam "AAAA-MM-DDTHH:MM" no horario de Brasilia (UTC-3, sem horario de verao).
function eventEndMs(endsAt: string): number {
  return Date.parse(`${endsAt.slice(0, 16)}:00-03:00`);
}

/** Chamado pelo Cron da Vercel 1 vez por dia: lembra quem fez check-in e nao confirmou a chegada 24 h apos o fim do evento. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const retention = await runRetention();
  if (!process.env.RESEND_API_KEY) return Response.json({ sent: 0, skipped: "RESEND_API_KEY ausente", retention });

  const db = getDb();
  const rows = (await db.prepare(
    `SELECT r.id, r.user_id, e.title, e.ends_at FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE e.modality IN ('in_person','hybrid') AND r.checked_in_at IS NOT NULL
       AND r.safe_home_at IS NULL AND r.safe_home_reminded_at IS NULL`
  ).all()) as { id: number; user_id: number; title: string; ends_at: string }[];

  const now = Date.now();
  let sent = 0;
  for (const r of rows) {
    const end = eventEndMs(r.ends_at);
    if (Number.isNaN(end) || now - end < DAY_MS) continue;
    const marked = await db.prepare(
      "UPDATE event_registrations SET safe_home_reminded_at = datetime('now') WHERE id = ? AND safe_home_reminded_at IS NULL AND safe_home_at IS NULL"
    ).run(r.id);
    if (!marked.changes) continue;
    await emailUser(
      r.user_id,
      "Voce chegou bem?",
      `Voce participou do evento "${r.title}". Se ja chegou bem em casa, por favor confirme ao organizador clicando no botao abaixo.`,
      "Cheguei bem em casa",
      "/dashboard"
    );
    sent++;
  }
  return Response.json({ sent, retention });
}
