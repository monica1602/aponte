import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getDashboardData, getEventAttendance } from "@/lib/admin-data";
import { AttendanceTable } from "@/components/admin-attendance";
import { AdminNav } from "@/components/admin-nav";
import { Bars, EvolutionChart, ToolStats } from "@/components/admin-charts";
import { Card } from "@/components/ui";
import { platformImpact } from "@/lib/impact";
import { ImpactGrid } from "@/components/impact";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

export default async function AdminDashboard() {
  if (!(await isAdmin())) redirect("/admin/login");
  const [d, attendance, impact] = await Promise.all([getDashboardData(), getEventAttendance(), platformImpact()]);
  const cards = [
    { label: "Mentorados", value: d.totals.mentee, href: "/admin/mentorados" },
    { label: "Mentores", value: d.totals.mentor, href: "/admin/mentores" },
    { label: "Empresas", value: d.totals.company, href: "/admin/empresas" },
    { label: "Projetos", value: d.totals.project },
    { label: "Mentorias ativas", value: d.totals.mentorshipActive, note: `${d.totals.mentorshipPending} pendentes` },
    { label: "Participacoes em projetos", value: d.totals.participations },
    { label: "Eventos", value: d.totals.events, note: `${d.totals.registrations} inscricoes · ${d.totals.checkins} check-ins`, href: "/admin/eventos" },
  ];
  return (
    <div className="py-8">
      <AdminNav current="/admin" />
      <h1 className="mb-6 text-2xl font-bold">Painel da plataforma</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map((c) => {
          const body = (
            <Card className="h-full">
              <p className="text-xs text-muted">{c.label}</p>
              <p className="mt-1 text-3xl font-bold">{c.value}</p>
              {c.note && <p className="mt-1 text-xs text-muted">{c.note}</p>}
            </Card>
          );
          return c.href ? <Link key={c.label} href={c.href} className="block transition-transform hover:-translate-y-0.5">{body}</Link> : <div key={c.label}>{body}</div>;
        })}
      </div>
      <Card className="mt-6">
        <h2 className="font-semibold">Indicadores de impacto</h2>
        <ImpactGrid items={impact.totals} />
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <caption className="mb-2 text-left text-muted">Ultimos 12 meses</caption>
            <thead><tr className="text-muted"><th className="py-1 pr-3">Mes</th>{impact.monthKeys.map((k) => <th key={k.key} className="py-1 pr-3">{k.label}</th>)}</tr></thead>
            <tbody>
              {impact.months.map((m) => (
                <tr key={m.month} className="border-t border-line">
                  <td className="py-1 pr-3">{m.month.split("-").reverse().join("/")}</td>
                  {impact.monthKeys.map((k) => <td key={k.key} className="py-1 pr-3">{m.values[k.key]}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Evolucao por dia</h2>
        <EvolutionChart days={d.days} />
      </Card>
      <Card className="mt-6 overflow-x-auto">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-semibold">Participantes por evento</h2>
          <Link href="/admin/eventos" className="text-xs text-accent hover:underline">Ver todos →</Link>
        </div>
        {attendance.length === 0 ? <p className="text-sm text-muted">Nenhum evento cadastrado.</p> : <AttendanceTable events={attendance.slice(0, 10)} />}
      </Card>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card><h2 className="mb-3 font-semibold">Projetos por tipo</h2><Bars data={d.projectsByKind} /></Card>
        <Card><h2 className="mb-3 font-semibold">Projetos por situacao</h2><Bars data={d.projectsByStatus} /></Card>
        <Card><h2 className="mb-3 font-semibold">Areas de interesse</h2><Bars data={d.areas.slice(0, 10)} /></Card>
      </div>
      <Card className="mt-6">
        <h2 className="mb-3 font-semibold">Ferramentas</h2>
        <ToolStats tools={d.tools} />
      </Card>
    </div>
  );
}
