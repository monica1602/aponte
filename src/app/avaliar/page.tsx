import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { completeMentorship, removeMentorship, submitReview } from "@/lib/actions";
import { REVIEW_COMMENT_MAX, eventReviewTarget, mentorshipReviewTarget, myReview } from "@/lib/reviews";
import { Card, Empty, Flash, PageHeader, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Avaliar — Ponte" };

function YesNo({ name, label, value }: { name: string; label: string; value: number | null | undefined }) {
  return (
    <fieldset className="text-sm">
      <legend className="font-medium">{label}</legend>
      <div className="mt-1 flex gap-4 text-muted">
        <label className="flex items-center gap-1.5"><input type="radio" name={name} value="1" required defaultChecked={value === 1} />Sim</label>
        <label className="flex items-center gap-1.5"><input type="radio" name={name} value="0" defaultChecked={value === 0} />Nao</label>
      </div>
    </fieldset>
  );
}

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ mentoria?: string; evento?: string; encerrar?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const isEvent = !!sp.evento;
  const targetId = Number(isEvent ? sp.evento : sp.mentoria) || 0;
  const ending = !isEvent && sp.encerrar === "1";
  const mentorship = isEvent ? null : await mentorshipReviewTarget(user.id, targetId);
  const event = isEvent ? await eventReviewTarget(user.id, targetId) : null;
  const current = mentorship || event ? await myReview(user.id, isEvent ? "event" : "mentorship", targetId) : null;
  const title = isEvent ? `Avaliar o evento${event ? ` "${event.title}"` : ""}` : `Avaliar a mentoria${mentorship ? ` com ${mentorship.other_name}` : ""}`;
  return (
    <div className="mx-auto max-w-2xl py-8">
      <PageHeader eyebrow="Avaliacao" title={title}>
        {isEvent
          ? "A organizacao ve so a media e os comentarios, sem nomes, quando houver pelo menos 3 avaliacoes."
          : "Quem orienta ve so a media geral das mentorias, sem comentarios e sem nomes, quando houver pelo menos 3 avaliacoes."}
      </PageHeader>
      <Flash params={sp} />
      {!mentorship && !event ? (
        <Empty>{isEvent ? "A avaliacao e so para quem fez check-in no evento, ate 30 dias depois do fim." : "Esta mentoria ainda nao pode ser avaliada. A avaliacao abre depois do primeiro encontro concluido."}</Empty>
      ) : (
        <Card>
          {ending && (
            <form action={completeMentorship} className="mb-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm">
              <input type="hidden" name="id" value={targetId} />
              <input type="hidden" name="return" value="/minha-rede" />
              <p>A mentoria chegou ao fim? Voce pode conclui-la em vez de remover: o historico fica guardado e conta no impacto de voces.</p>
              <button className={`${btnSecondaryCls} mt-2`}>Concluir mentoria</button>
            </form>
          )}
          {ending && <p className="mb-4 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-sm">Antes de remover a conexao, quer avaliar a mentoria? Voce tambem pode remover sem avaliar.</p>}
          {current && <p className="mb-4 text-xs text-muted">Voce ja avaliou. Ao salvar, a avaliacao anterior e substituida.</p>}
          <form action={submitReview} className="space-y-4">
            <input type="hidden" name="kind" value={isEvent ? "event" : "mentorship"} />
            <input type="hidden" name="target_id" value={targetId} />
            {ending && <input type="hidden" name="encerrar" value="1" />}
            <fieldset className="text-sm">
              <legend className="font-medium">Nota</legend>
              <div className="mt-1 flex flex-wrap gap-4 text-muted">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="flex items-center gap-1.5"><input type="radio" name="rating" value={n} required defaultChecked={current?.rating === n} />{n} {n === 1 ? "(ruim)" : n === 5 ? "(otima)" : ""}</label>
                ))}
              </div>
            </fieldset>
            {!isEvent && (
              <>
                <YesNo name="as_agreed" label="Os encontros aconteceram como combinado?" value={current?.as_agreed} />
                <YesNo name="recommend" label="Voce recomendaria?" value={current?.recommend} />
              </>
            )}
            <label className="block text-sm">
              <span className="font-medium">Comentario (opcional)</span>
              <textarea name="comment" rows={4} maxLength={REVIEW_COMMENT_MAX} defaultValue={current?.comment ?? ""} className={`${inputCls} mt-1`} />
            </label>
            <details className="rounded-lg border border-line p-3 text-sm">
              <summary className="cursor-pointer font-medium">Quero relatar algo sensivel (assedio, discriminacao, seguranca)</summary>
              <p className="mt-2 text-xs text-muted">O relato nao entra na avaliacao e nunca e mostrado para a pessoa avaliada. Ele vai em sigilo para a administracao, que analisa com base no Codigo de Conduta.</p>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" name="sensitive" />Enviar um relato sensivel</label>
              <textarea name="sensitive_text" rows={4} maxLength={REVIEW_COMMENT_MAX} aria-label="Relato sensivel" placeholder="Descreva o que aconteceu" className={`${inputCls} mt-2`} />
            </details>
            <button className={btnCls}>{ending ? "Enviar avaliacao e remover conexao" : current ? "Salvar alteracao" : "Enviar avaliacao"}</button>
          </form>
          {ending && (
            <form action={removeMentorship} className="mt-4 border-t border-line pt-4">
              <input type="hidden" name="id" value={targetId} />
              <input type="hidden" name="skip_review" value="1" />
              <button className={btnSecondaryCls}>Remover sem avaliar</button>
            </form>
          )}
        </Card>
      )}
      <Link href={isEvent ? `/eventos/${targetId}` : "/dashboard"} className="mt-6 inline-block text-sm text-muted hover:text-fg">← Voltar</Link>
    </div>
  );
}
