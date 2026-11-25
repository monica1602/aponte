import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getEventAttendance } from "@/lib/admin-data";
import { AdminNav } from "@/components/admin-nav";
import { AttendanceTable } from "@/components/admin-attendance";
import { Card, Empty, Flash, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";
import { pendingEvents } from "@/lib/event-invites";
import { adminApproveEvent, adminRejectEvent } from "@/lib/actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

export default async function AdminEventsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const events = await getEventAttendance();
  const pending = await pendingEvents();
  const checkins = events.reduce((n, e) => n + e.checkins, 0);
  return (
    <div className="py-8">
      <AdminNav current="/admin/eventos" />
      <Flash params={sp} />
      <h2 className="mb-2 text-lg font-semibold">Aguardando aprovacao <span className="text-base font-normal text-muted">({pending.length})</span></h2>
      {pending.length === 0 ? <div className="mb-8"><Empty>Nenhum evento aguardando aprovacao.</Empty></div> : (
        <ul className="mb-8 space-y-4">{pending.map((p) => (
          <li key={p.id}><Card>
            <p className="font-semibold [overflow-wrap:anywhere]">{p.title} <span className="text-xs font-normal text-muted">· {p.category}</span></p>
            <p className="mt-1 text-xs text-muted">Por <Link href={`/admin/usuarios/${p.owner_id}`} className="text-accent hover:underline">{p.owner_name}</Link> · {new Date(p.starts_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })} ate {new Date(p.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · {p.modality === "in_person" ? "Presencial" : p.modality === "hybrid" ? "Hibrido" : "Online"}{p.location ? ` · ${p.location}${p.city ? `, ${p.city}${p.state ? `/${p.state}` : ""}` : ""}` : ""}</p>
            {p.description && <p className="mt-2 whitespace-pre-line text-sm [overflow-wrap:anywhere]">{p.description}</p>}
            <p className="mt-2 text-xs text-muted [overflow-wrap:anywhere]">Convidados: {p.invitees || "ninguem ainda"}</p>
            <div className="mt-3 flex flex-wrap items-start gap-3">
              <form action={adminApproveEvent}><input type="hidden" name="event_id" value={p.id} /><button className={btnCls}>Aprovar</button></form>
              <form action={adminRejectEvent} className="flex flex-1 flex-wrap gap-2"><input type="hidden" name="event_id" value={p.id} /><input name="reason" required maxLength={300} placeholder="Motivo da recusa (a pessoa recebe este texto)" aria-label="Motivo da recusa" className={`${inputCls} min-w-48 flex-1`} /><button className={btnSecondaryCls}>Recusar</button></form>
            </div>
          </Card></li>
        ))}</ul>
      )}
      <h1 className="mb-1 text-2xl font-bold">Eventos <span className="text-base font-normal text-muted">({events.length})</span></h1>
      <p className="mb-4 text-sm text-muted">{checkins} participante(s) com check-in no total.</p>
      {events.length === 0 ? <Empty>Nenhum evento cadastrado.</Empty> : (
        <Card className="overflow-x-auto p-0"><AttendanceTable events={events} /></Card>
      )}
    </div>
  );
}
