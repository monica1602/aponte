import { getDb } from "./db";

export type ImpactItem = { key: string; label: string; value: number; note?: string };

async function n(sql: string, ...args: number[]): Promise<number> {
  const r = (await getDb().prepare(sql).get(...args)) as { n: number } | undefined;
  return Number(r?.n ?? 0);
}

/** Indicadores de uma pessoa. Certificados revogados nao contam. */
export async function personalImpact(userId: number, role: string): Promise<ImpactItem[]> {
  const u = userId;
  const mentorships = await n("SELECT COUNT(*) AS n FROM mentorships WHERE (mentor_id = ? OR mentee_id = ?) AND completed_at IS NOT NULL", u, u);
  const meetings = await n(
    `SELECT COUNT(*) AS n FROM mentorship_meetings mm JOIN mentorships m ON m.id = mm.mentorship_id
     WHERE (m.mentor_id = ? OR m.mentee_id = ?) AND mm.status = 'completed'`, u, u);
  const items: ImpactItem[] = [
    { key: "mentorias", label: "Mentorias concluidas", value: mentorships },
    { key: "encontros", label: "Encontros de mentoria concluidos", value: meetings },
  ];
  if (role === "mentee") {
    const goals = await n("SELECT COUNT(*) AS n FROM learning_goals WHERE mentee_id = ? AND status = 'concluida'", u);
    const steps = await n("SELECT COUNT(*) AS n FROM goal_steps s JOIN learning_goals g ON g.id = s.goal_id WHERE g.mentee_id = ? AND s.done = 1", u);
    const checkins = await n("SELECT COUNT(*) AS n FROM event_registrations WHERE user_id = ? AND status = 'approved' AND checked_in_at IS NOT NULL", u);
    const confirmed = await n("SELECT COUNT(*) AS n FROM event_registrations WHERE user_id = ? AND status = 'approved'", u);
    const certs = await n("SELECT COUNT(*) AS n FROM certificates WHERE user_id = ? AND revoked_at IS NULL", u);
    const accepted = await n("SELECT COUNT(*) AS n FROM project_applications WHERE user_id = ? AND status = 'accepted'", u);
    items.push(
      { key: "metas", label: "Metas atingidas", value: goals, note: `${steps} ${steps === 1 ? "etapa feita" : "etapas feitas"}` },
      { key: "eventos", label: "Presencas em eventos", value: checkins, note: `${confirmed} ${confirmed === 1 ? "inscricao confirmada" : "inscricoes confirmadas"}` },
      { key: "certificados", label: "Certificados recebidos", value: certs },
      { key: "oportunidades", label: "Candidaturas aceitas em projetos", value: accepted },
    );
    return items;
  }
  if (role === "mentor") {
    const goals = await n(
      `SELECT COUNT(*) AS n FROM learning_goals WHERE status = 'concluida'
       AND mentee_id IN (SELECT mentee_id FROM mentorships WHERE mentor_id = ? AND status IN ('active','completed'))`, u);
    items.push({ key: "metas", label: "Metas atingidas pelos mentorados", value: goals });
  }
  const events = await n("SELECT COUNT(*) AS n FROM events WHERE owner_id = ? AND status = 'published'", u);
  const present = await n(
    `SELECT COUNT(*) AS n FROM event_registrations r JOIN events e ON e.id = r.event_id
     WHERE e.owner_id = ? AND r.status = 'approved' AND r.checked_in_at IS NOT NULL`, u);
  const issued = await n("SELECT COUNT(*) AS n FROM certificates WHERE issued_by = ? AND revoked_at IS NULL", u);
  const opps = await n("SELECT COUNT(*) AS n FROM opportunities WHERE owner_id = ?", u);
  const accepted = await n(
    "SELECT COUNT(*) AS n FROM project_applications pa JOIN projects p ON p.id = pa.project_id WHERE p.owner_id = ? AND pa.status = 'accepted'", u);
  items.push(
    { key: "eventos", label: "Eventos organizados", value: events, note: `${present} ${present === 1 ? "presenca" : "presencas"}` },
    { key: "certificados", label: "Certificados emitidos", value: issued },
    { key: "oportunidades", label: "Oportunidades publicadas", value: opps, note: `${accepted} ${accepted === 1 ? "candidatura aceita" : "candidaturas aceitas"} nos seus projetos` },
  );
  return role === "company" ? items.filter((i) => i.key !== "encontros" || i.value > 0) : items;
}

export type PlatformImpact = { totals: ImpactItem[]; months: { month: string; values: Record<string, number> }[]; monthKeys: { key: string; label: string }[] };

/** Indicadores da plataforma, com os ultimos 12 meses (pela data de cada registro). */
export async function platformImpact(): Promise<PlatformImpact> {
  const db = getDb();
  const dates = async (sql: string) => ((await db.prepare(sql).all()) as { d: string | null }[]).map((r) => String(r.d ?? "").slice(0, 7)).filter(Boolean);
  const series: Record<string, string[]> = {
    mentorias: await dates("SELECT completed_at AS d FROM mentorships WHERE completed_at IS NOT NULL"),
    encontros: await dates("SELECT scheduled_at AS d FROM mentorship_meetings WHERE status = 'completed'"),
    presencas: await dates("SELECT checked_in_at AS d FROM event_registrations WHERE status = 'approved' AND checked_in_at IS NOT NULL"),
    certificados: await dates("SELECT issued_at AS d FROM certificates WHERE revoked_at IS NULL"),
    oportunidades: await dates("SELECT created_at AS d FROM opportunities"),
    candidaturas: await dates("SELECT created_at AS d FROM project_applications WHERE status = 'accepted'"),
  };
  const goals = Number(((await db.prepare("SELECT COUNT(*) AS n FROM learning_goals WHERE status = 'concluida'").get()) as { n: number }).n);
  const steps = Number(((await db.prepare("SELECT COUNT(*) AS n FROM goal_steps WHERE done = 1").get()) as { n: number }).n);
  const confirmed = Number(((await db.prepare("SELECT COUNT(*) AS n FROM event_registrations WHERE status = 'approved'").get()) as { n: number }).n);
  const totals: ImpactItem[] = [
    { key: "mentorias", label: "Mentorias concluidas", value: series.mentorias.length },
    { key: "encontros", label: "Encontros de mentoria concluidos", value: series.encontros.length },
    { key: "metas", label: "Metas atingidas", value: goals, note: `${steps} etapas feitas` },
    { key: "presencas", label: "Presencas em eventos", value: series.presencas.length, note: `${confirmed} inscricoes confirmadas` },
    { key: "certificados", label: "Certificados validos", value: series.certificados.length },
    { key: "oportunidades", label: "Oportunidades publicadas", value: series.oportunidades.length, note: `${series.candidaturas.length} candidaturas aceitas em projetos` },
  ];
  const now = new Date();
  const months: PlatformImpact["months"] = [];
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7);
    months.push({ month: m, values: Object.fromEntries(Object.entries(series).map(([k, v]) => [k, v.filter((d) => d === m).length])) });
  }
  const monthKeys = [
    { key: "mentorias", label: "Mentorias concluidas" }, { key: "encontros", label: "Encontros" }, { key: "presencas", label: "Presencas" },
    { key: "certificados", label: "Certificados" }, { key: "oportunidades", label: "Oportunidades" }, { key: "candidaturas", label: "Candidaturas aceitas" },
  ];
  return { totals, months, monthKeys };
}
