import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { addMeetingAgreement, saveMeetingNote, sendMeetingFeedback, toggleMeetingAgreement } from "@/lib/actions";
import { listMeetings, meetingDetails, meetingPath, parseMeetingRef } from "@/lib/meetings";
import { MeetingItem } from "@/components/meeting-item";
import { Card, Flash, PageHeader, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Encontro — Ponte" };

const at = (s: string) => new Date(`${s.replace(" ", "T")}Z`).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

export default async function EncontroPage({ params, searchParams }: {
  params: Promise<{ ref: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { ref } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const parsed = parseMeetingRef(ref);
  const m = parsed && (await listMeetings(user.id)).find((x) => x.kind === parsed.kind && x.id === parsed.id);
  if (!m) notFound();
  const { note, agreements, feedback } = await meetingDetails(m.kind, m.id, user.id);
  const path = meetingPath(m.kind, m.id);
  const hidden = <><input type="hidden" name="kind" value={m.kind} /><input type="hidden" name="meeting_id" value={m.id} /></>;
  const mine = feedback.find((f) => f.author_id === user.id);
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Encontros" title={`Encontro com ${m.other_name}`}>
        <Link href="/encontros" className="text-accent underline">← Voltar para Encontros</Link>
      </PageHeader>
      <Flash params={sp} />
      <div className="space-y-6">
        <ul><MeetingItem m={m} userId={user.id} returnTo={path} showOpen={false} /></ul>
        <Card>
          <h2 className="font-semibold">Minha nota privada</h2>
          <p className="mt-1 text-xs text-muted">So voce consegue ver esta nota. {m.other_name} e a administracao nao veem.</p>
          <form action={saveMeetingNote} className="mt-3 space-y-2">
            {hidden}
            <textarea name="body" rows={4} maxLength={2000} defaultValue={note?.body ?? ""} className={inputCls} />
            <div className="flex items-center gap-3"><button className={btnSecondaryCls}>Salvar nota</button>{note && <span className="text-xs text-muted">Salva em {at(note.updated_at)}</span>}</div>
          </form>
        </Card>
        <Card>
          <h2 className="font-semibold">Combinados</h2>
          <p className="mt-1 text-xs text-muted">As duas pessoas veem e podem marcar como feito.</p>
          {agreements.length === 0 ? <p className="mt-3 text-sm text-muted">Nenhum combinado ainda.</p> : (
            <ul className="mt-3 space-y-2">
              {agreements.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-line p-3 text-sm">
                  <span className={a.done_at ? "text-muted line-through" : ""}>{a.body} <span className="text-xs text-muted no-underline">— {a.author_name}</span></span>
                  <form action={toggleMeetingAgreement}>{hidden}<input type="hidden" name="agreement_id" value={a.id} /><button className="text-xs text-accent hover:underline">{a.done_at ? "Reabrir" : "Marcar como feito"}</button></form>
                </li>
              ))}
            </ul>
          )}
          {m.status !== "cancelled" && (
            <form action={addMeetingAgreement} className="mt-3 flex flex-wrap gap-2">
              {hidden}
              <input name="body" required maxLength={2000} placeholder="Ex.: Ler o capitulo 3 ate sexta" className={`${inputCls} flex-1`} />
              <button className={btnSecondaryCls}>Acrescentar</button>
            </form>
          )}
        </Card>
        <Card>
          <h2 className="font-semibold">Feedback</h2>
          {feedback.length > 0 && (
            <ul className="mt-3 space-y-2">
              {feedback.map((f) => <li key={f.id} className="rounded-xl border border-line p-3 text-sm"><p className="text-xs text-muted">{f.author_name} · {at(f.created_at)}</p><p className="mt-1 whitespace-pre-line">{f.body}</p></li>)}
            </ul>
          )}
          {m.status !== "completed" ? <p className="mt-2 text-sm text-muted">O feedback abre depois que o encontro for concluido.</p>
            : mine ? <p className="mt-2 text-xs text-muted">Voce ja enviou o seu feedback.</p> : (
            <form action={sendMeetingFeedback} className="mt-3 space-y-2">
              {hidden}
              <textarea name="body" rows={4} required minLength={2} maxLength={2000} placeholder={`Como foi o encontro? ${m.other_name} vera o seu feedback.`} className={inputCls} />
              <button className={btnCls}>Enviar feedback</button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
