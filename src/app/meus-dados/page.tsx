import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { blockUser, createDataRequest, requestEmailChange, saveEmailPreferences, updateName } from "@/lib/actions";
import { listBlocked } from "@/lib/moderation";
import {
  MY_DATA_SECTIONS, REQUEST_DEADLINE_DAYS, REQUEST_KIND_PT, REQUEST_KINDS, brDate, collectMyData, myDataRequests,
  pendingEmailChange, requestDeadline,
} from "@/lib/my-data";
import { Card, Field, Flash, PageHeader, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus dados — Ponte" };

function count(value: unknown): string {
  if (Array.isArray(value)) return value.length === 0 ? "nenhum registro" : `${value.length} registro(s)`;
  return value ? "preenchido" : "nao preenchido";
}

export default async function MeusDadosPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [data, requests, newEmail, blocked] = await Promise.all([collectMyData(user.id), myDataRequests(user.id), pendingEmailChange(user.id), listBlocked(user.id)]);
  const sections = Object.entries(MY_DATA_SECTIONS).filter(([k]) => k !== "conta") as [keyof typeof MY_DATA_SECTIONS, string][];
  return (
    <div className="mx-auto max-w-3xl py-8">
      <PageHeader eyebrow="Privacidade" title="Meus dados">
        Veja, baixe, corrija ou apague os dados que a Ponte guarda sobre voce, ou faca um pedido a administracao.
      </PageHeader>
      <Flash params={sp} />

      <Card className="mt-6">
        <h2 className="font-semibold">1. Ver meus dados</h2>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Nome</dt><dd>{user.name}</dd>
          <dt className="text-muted">E-mail</dt><dd>{user.email}</dd>
          <dt className="text-muted">Conta criada em</dt><dd>{brDate(user.created_at)}</dd>
        </dl>
        <table className="mt-4 w-full text-left text-sm">
          <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">O que guardamos</th><th className="font-medium">Situacao</th></tr></thead>
          <tbody>
            {sections.map(([k, label]) => (
              <tr key={k} className="border-t border-line"><td className="py-1.5">{label}</td><td className="text-muted">{count(data?.[k])}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">O conteudo completo de cada item esta no arquivo da parte 2. Senha, codigos de seguranca e sessoes nao sao mostrados.</p>
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">2. Baixar meus dados</h2>
        <p className="mt-1 text-sm text-muted">Gera o arquivo <code>meus-dados-ponte.json</code>, com tudo o que aparece na parte 1, para voce guardar ou levar para outro servico.</p>
        <a href="/meus-dados/exportar" download className={`${btnCls} mt-4 inline-block`}>Baixar meus dados</a>
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">3. Corrigir meus dados</h2>
        <p className="mt-1 text-sm text-muted">
          Apresentacao, habilidades, disponibilidade e permissoes sao corrigidas em <Link href="/perfil" className="text-accent hover:underline">Meu perfil</Link>.
        </p>
        <form action={updateName} className="mt-4 space-y-3">
          <Field label="Nome">
            <input name="name" required minLength={2} maxLength={120} defaultValue={user.name} className={inputCls} />
          </Field>
          <button className={btnSecondaryCls}>Salvar nome</button>
        </form>
        <form action={requestEmailChange} data-no-keep className="mt-6 space-y-3 border-t border-line pt-5">
          <p className="text-sm text-muted">
            Para trocar o e-mail, enviamos um link de confirmacao para o e-mail novo. O e-mail so muda depois do clique nesse link.
          </p>
          {newEmail && <p className="text-sm text-accent">Troca pendente: aguardando a confirmacao de {newEmail}.</p>}
          <Field label="E-mail novo">
            <input name="email" type="email" required autoComplete="email" className={inputCls} />
          </Field>
          <Field label="Digite sua senha para confirmar">
            <input name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </Field>
          <button className={btnSecondaryCls}>Enviar link de confirmacao</button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 id="comunicacoes" className="scroll-mt-24 font-semibold">4. Comunicacoes por e-mail</h2>
        <p className="mt-1 text-sm text-muted">Escolha quais e-mails voce quer receber. Os avisos dentro do site, no sino, continuam chegando.</p>
        <form action={saveEmailPreferences} className="mt-4 space-y-3 text-sm">
          <label className="flex items-start gap-2 text-muted">
            <input type="checkbox" checked disabled className="mt-1" />
            <span><span className="font-medium text-fg">Essenciais</span>: seguranca da conta, confirmacao e troca de e-mail, senha e resposta a pedidos sobre seus dados. Sempre enviados.</span>
          </label>
          <label className="flex items-start gap-2 text-muted">
            <input name="email_network" type="checkbox" defaultChecked={Boolean(user.email_network)} className="mt-1" />
            <span><span className="font-medium text-fg">Avisos da rede</span>: convites, pedidos de mentoria, candidaturas, contribuicoes e confirmacoes de chegada.</span>
          </label>
          <label className="flex items-start gap-2 text-muted">
            <input name="email_reminders" type="checkbox" defaultChecked={Boolean(user.email_reminders)} className="mt-1" />
            <span><span className="font-medium text-fg">Lembretes de eventos</span>: o lembrete &quot;Voce chegou bem?&quot; depois de eventos presenciais.</span>
          </label>
          <label className="flex items-start gap-2 text-muted">
            <input name="news" type="checkbox" defaultChecked={Boolean(user.news_consent)} className="mt-1" />
            <span><span className="font-medium text-fg">Novidades da Ponte</span>: eventos novos e oportunidades. Opcional.</span>
          </label>
          <button className={btnSecondaryCls}>Salvar preferencias</button>
        </form>
      </Card>

      <Card className="mt-6">
        <h2 id="bloqueios" className="scroll-mt-24 font-semibold">5. Pessoas bloqueadas</h2>
        <p className="mt-1 text-sm text-muted">Quem voce bloqueou nao pode enviar mensagens, pedidos de contato nem convites para voce, e nao e avisado.</p>
        {blocked.length === 0 ? <p className="mt-3 text-sm text-muted">Voce nao bloqueou ninguem.</p> : (
          <ul className="mt-3 space-y-2 text-sm">
            {blocked.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span>{b.name} <span className="text-xs text-muted">· desde {brDate(b.created_at)}</span></span>
                <form action={blockUser}>
                  <input type="hidden" name="user_id" value={b.id} />
                  <input type="hidden" name="return" value="/meus-dados" />
                  <button name="decision" value="unblock" className={btnSecondaryCls}>Desbloquear</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">6. Fazer um pedido a administracao</h2>
        <p className="mt-1 text-sm text-muted">Para o que voce nao consegue fazer sozinho aqui. A administracao responde em ate {REQUEST_DEADLINE_DAYS} dias.</p>
        <form action={createDataRequest} className="mt-4 space-y-3">
          <Field label="Tipo do pedido">
            <select name="kind" required defaultValue="" className={inputCls}>
              <option value="" disabled>Escolha</option>
              {REQUEST_KINDS.map((k) => <option key={k} value={k}>{REQUEST_KIND_PT[k]}</option>)}
            </select>
          </Field>
          <Field label="Descreva o pedido" hint="Obrigatorio para correcao e outro pedido.">
            <textarea name="message" rows={3} maxLength={2000} className={inputCls} />
          </Field>
          <button className={btnSecondaryCls}>Enviar pedido</button>
        </form>
        {requests.length > 0 && (
          <div className="mt-6 space-y-3 border-t border-line pt-5">
            <h3 className="text-sm font-semibold">Meus pedidos</h3>
            {requests.map((r) => (
              <div key={r.id} className="rounded-md border border-line p-3 text-sm">
                <p className="font-medium">{REQUEST_KIND_PT[r.kind] ?? r.kind}</p>
                <p className="text-xs text-muted">
                  Enviado em {brDate(r.created_at)} ·{" "}
                  {r.status === "done" ? `Respondido em ${brDate(r.answered_at ?? "")}` : `Aguardando resposta, prazo ${brDate(requestDeadline(r.created_at))}`}
                </p>
                {r.message && <p className="mt-2 whitespace-pre-line text-muted">{r.message}</p>}
                {r.response && <p className="mt-2 whitespace-pre-line rounded bg-accent/10 p-2"><span className="font-medium">Resposta:</span> {r.response}</p>}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="font-semibold">7. Excluir minha conta</h2>
        <p className="mt-1 text-sm text-muted">Apaga de forma definitiva sua conta e os dados ligados a ela.</p>
        <Link href="/perfil#excluir-conta" className="mt-3 inline-block text-sm text-red-300 hover:underline">Ir para a exclusao da conta →</Link>
      </Card>
    </div>
  );
}
