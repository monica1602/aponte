import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { listMeetings } from "@/lib/meetings";
import { MeetingItem } from "@/components/meeting-item";
import { Card, Empty, Flash, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Encontros — Ponte" };

export default async function EncontrosPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const meetings = await listMeetings(user.id);
  const agenda = meetings.filter((m) => m.status === "scheduled");
  const history = meetings.filter((m) => m.status !== "scheduled").reverse();
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Minha conta" title="Encontros">Agenda e historico dos encontros de mentoria e com empresas. Para pedir um encontro novo, use o <Link href="/dashboard" className="text-accent underline">Painel</Link> ou a sua rede.</PageHeader>
      <Flash params={sp} />
      <div className="space-y-6">
        <Card>
          <h2 className="font-semibold">Agenda</h2>
          {agenda.length === 0 ? <div className="mt-2"><Empty>Nenhum encontro agendado.</Empty></div> : <ul className="mt-3 space-y-2">{agenda.map((m) => <MeetingItem key={`${m.kind}-${m.id}`} m={m} userId={user.id} returnTo="/encontros" />)}</ul>}
        </Card>
        <Card>
          <h2 className="font-semibold">Historico</h2>
          {history.length === 0 ? <div className="mt-2"><Empty>Nenhum encontro concluido ou cancelado.</Empty></div> : <ul className="mt-3 space-y-2">{history.map((m) => <MeetingItem key={`${m.kind}-${m.id}`} m={m} userId={user.id} returnTo="/encontros" />)}</ul>}
        </Card>
      </div>
    </div>
  );
}
