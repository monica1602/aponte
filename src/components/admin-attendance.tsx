import Link from "next/link";
import type { EventAttendance } from "@/lib/admin-data";
import { eventTimeMs, spTime } from "@/lib/event-time";

const MODALITY: Record<string, string> = { online: "Online", in_person: "Presencial", hybrid: "Hibrido" };

export function AttendanceTable({ events, deletable = false }: { events: EventAttendance[]; deletable?: boolean }) {
  return (
    <table className="w-full min-w-[720px] text-left text-sm">
      <thead className="border-b border-line text-xs text-muted">
        <tr>
          <th className="p-3 font-medium">Evento</th>
          <th className="p-3 font-medium">Organizador</th>
          <th className="p-3 font-medium">Modalidade</th>
          <th className="p-3 font-medium">Inicio</th>
          <th className="p-3 font-medium">Situacao</th>
          <th className="p-3 font-medium">Inscricoes confirmadas</th>
          <th className="p-3 font-medium">Participantes (check-in)</th>
          {deletable && <th className="p-3 font-medium"><span className="sr-only">Excluir</span></th>}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
          <tr key={e.id} className="border-t border-line">
            <td className="p-3"><Link href={`/eventos/${e.id}`} className="text-accent hover:underline">{e.title}</Link></td>
            <td className="p-3">{e.organizer}</td>
            <td className="p-3 text-muted">{MODALITY[e.modality] ?? e.modality}</td>
            <td className="p-3 text-xs text-muted">{spTime(eventTimeMs(e.starts_at))}</td>
            <td className="p-3 text-xs text-muted">{e.situation}</td>
            <td className="p-3">{e.approved}</td>
            <td className="p-3 font-semibold">{e.checkins}</td>
            {deletable && <td className="p-3"><Link href={`/admin/excluir/evento/${e.id}`} className="text-xs text-red-300 hover:underline">Excluir</Link></td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
