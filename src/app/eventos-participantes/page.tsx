import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { ParticipantEvents } from "@/components/participant-events";
import { Flash, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eventos participantes — Ponte" };

export default async function EventosParticipantesPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Minha conta" title="Eventos participantes">Eventos em que voce se inscreveu.</PageHeader>
      <Flash params={sp} />
      <ParticipantEvents userId={user.id} returnTo="/eventos-participantes" />
    </div>
  );
}
