import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { getEventAttendance } from "@/lib/admin-data";
import { AdminNav } from "@/components/admin-nav";
import { AttendanceTable } from "@/components/admin-attendance";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

export default async function AdminEventsPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const events = await getEventAttendance();
  const checkins = events.reduce((n, e) => n + e.checkins, 0);
  return (
    <div className="py-8">
      <AdminNav current="/admin/eventos" />
      <h1 className="mb-1 text-2xl font-bold">Eventos <span className="text-base font-normal text-muted">({events.length})</span></h1>
      <p className="mb-4 text-sm text-muted">{checkins} participante(s) com check-in no total.</p>
      {events.length === 0 ? <Empty>Nenhum evento cadastrado.</Empty> : (
        <Card className="overflow-x-auto p-0"><AttendanceTable events={events} /></Card>
      )}
    </div>
  );
}
