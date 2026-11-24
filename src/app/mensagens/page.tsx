import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { blockUser, respondContactRequest, sendMessage } from "@/lib/actions";
import { blockedBetween, hasBlocked } from "@/lib/moderation";
import { ReportForm } from "@/components/report-form";
import {
  MESSAGE_MAX, canMessageDirect, conversationMessages, getConversation, listConversations, markConversationRead, messageTime, otherOf, type ConversationItem,
} from "@/lib/messages";
import { getUser } from "@/lib/db";
import { Badge, Card, Empty, Flash, PageHeader, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mensagens — Ponte" };

function preview(c: ConversationItem, me: number): string {
  const text = c.last_body ?? "Mensagem removida";
  const short = text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return c.last_sender === me ? `Voce: ${short}` : short;
}

function ConversationLink({ c, me, active }: { c: ConversationItem; me: number; active: boolean }) {
  return (
    <Link href={`/mensagens?c=${c.id}`} aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-raised ${active ? "bg-raised" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <span className={c.unread ? "font-semibold text-fg" : "text-fg/90"}>{c.other_name ?? "Conta excluida"}</span>
        {c.unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[10px] font-bold text-ink" aria-label={`${c.unread} nao lidas`}>{c.unread}</span>}
      </span>
      <span className="block truncate text-xs text-muted">
        {c.status === "requested" && c.requested_by === me ? "Pedido de contato enviado · " : ""}
        {c.status === "declined" ? "Pedido de contato nao aceito · " : ""}
        {preview(c, me)}
      </span>
    </Link>
  );
}

export default async function MensagensPage({ searchParams }: { searchParams: Promise<{ c?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const selectedId = Number(sp.c) || 0;
  const selected = selectedId ? await getConversation(selectedId, user.id) : undefined;
  if (selected && (selected.status !== "declined" || selected.requested_by === user.id)) await markConversationRead(selected.id, user.id);
  const all = await listConversations(user.id);
  const requests = all.filter((c) => c.status === "requested" && c.requested_by !== user.id);
  const conversations = all.filter((c) => !requests.includes(c));
  const visible = selected && all.some((c) => c.id === selected.id) ? selected : undefined;
  const messages = visible ? await conversationMessages(visible.id) : [];
  const otherId = visible ? otherOf(visible, user.id) : null;
  const other = otherId ? await getUser(otherId) : null;
  const iBlocked = other ? await hasBlocked(user.id, other.id) : false;
  const blocked = other ? await blockedBetween(user.id, other.id) : false;
  const incomingRequest = visible?.status === "requested" && visible.requested_by !== user.id;
  const direct = visible && otherId && visible.status !== "open" ? await canMessageDirect(user.id, otherId) : false;
  return (
    <div className="pb-8">
      <PageHeader eyebrow="Minha conta" title="Mensagens">
        Converse com outras pessoas da Ponte sem mostrar o seu e-mail.
      </PageHeader>
      <Flash params={sp} />
      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <aside aria-label="Conversas" className={`space-y-4 ${visible ? "hidden md:block" : ""}`}>
          {requests.length > 0 && (
            <Card className="p-3">
              <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Pedidos de contato</h2>
              {requests.map((c) => <ConversationLink key={c.id} c={c} me={user.id} active={c.id === visible?.id} />)}
            </Card>
          )}
          <Card className="p-3">
            <h2 className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted">Conversas</h2>
            {conversations.length === 0
              ? <p className="px-3 py-2 text-sm text-muted">Nenhuma conversa ainda. Para comecar, abra o perfil de uma pessoa e clique em Enviar mensagem ou Pedir contato.</p>
              : conversations.map((c) => <ConversationLink key={c.id} c={c} me={user.id} active={c.id === visible?.id} />)}
          </Card>
        </aside>
        <section aria-label="Conversa" className={`min-w-0 ${visible ? "" : "hidden md:block"}`}>
          {!visible ? (
            <Empty>{selectedId ? "Conversa nao encontrada." : "Escolha uma conversa na lista."}</Empty>
          ) : (
            <Card className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                <Link href="/mensagens" className="text-sm text-accent md:hidden">← Conversas</Link>
                <h2 className="font-semibold">
                  {other ? (other.public_profile_consent ? <Link href={`/pessoas/${other.id}`} className="hover:underline">{other.name}</Link> : other.name) : "Conta excluida"}
                </h2>
                {visible.status === "requested" && <Badge kind="pending" label="Pedido de contato" />}
                {other && (
                  <form action={blockUser}>
                    <input type="hidden" name="user_id" value={other.id} />
                    <input type="hidden" name="return" value={`/mensagens?c=${visible.id}`} />
                    <button name="decision" value={iBlocked ? "unblock" : "block"} className="cursor-pointer text-xs text-muted hover:text-red-300">{iBlocked ? "Desbloquear" : "Bloquear"}</button>
                  </form>
                )}
              </div>
              <ol aria-label="Mensagens" className="space-y-3">
                {messages.map((m) => {
                  const mine = m.sender_id === user.id;
                  return (
                    <li key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-accent/15" : "bg-raised"}`}>
                        {m.body === null
                          ? <p className="italic text-muted">Mensagem removida</p>
                          : <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>}
                        <p className="mt-1 text-[11px] text-muted">
                          {messageTime(m.created_at)}{mine && (m.read_at ? ` · Lida em ${messageTime(m.read_at)}` : " · Nao lida")}
                        </p>
                        {!mine && m.body !== null && <div className="mt-1"><ReportForm type="message" id={m.id} ret={`/mensagens?c=${visible.id}`} label="Denunciar mensagem" /></div>}
                      </div>
                    </li>
                  );
                })}
              </ol>
              {!other ? (
                <p className="text-sm text-muted">Esta conta foi excluida. Nao e possivel enviar mensagens.</p>
              ) : blocked ? (
                <p className="border-t border-line pt-3 text-sm text-muted">{iBlocked ? "Voce bloqueou esta pessoa. Desbloqueie para voltar a conversar." : "Nao e possivel enviar mensagens nesta conversa."}</p>
              ) : incomingRequest ? (
                <div className="space-y-2 border-t border-line pt-3">
                  <p className="text-sm text-muted">{other.name} pediu contato com voce. Se aceitar, voces podem conversar por aqui. O seu e-mail continua oculto.</p>
                  <form action={respondContactRequest} className="flex gap-2">
                    <input type="hidden" name="conversation_id" value={visible.id} />
                    <button name="decision" value="accept" className={btnCls}>Aceitar</button>
                    <button name="decision" value="decline" className={btnSecondaryCls}>Recusar</button>
                  </form>
                </div>
              ) : visible.status === "requested" && !direct ? (
                <p className="border-t border-line pt-3 text-sm text-muted">Pedido de contato enviado. A conversa abre quando a pessoa aceitar.</p>
              ) : visible.status === "declined" && !direct ? (
                <p className="border-t border-line pt-3 text-sm text-muted">A pessoa nao aceitou o pedido de contato.</p>
              ) : (
                <form action={sendMessage} className="space-y-2 border-t border-line pt-3">
                  <input type="hidden" name="conversation_id" value={visible.id} />
                  <textarea name="body" required rows={3} maxLength={MESSAGE_MAX} aria-label="Mensagem" placeholder="Escreva sua mensagem" className={inputCls} />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">Ate {MESSAGE_MAX} caracteres. A administracao nao le as conversas; ve so uma mensagem que for denunciada.</span>
                    <button className={btnCls}>Enviar</button>
                  </div>
                </form>
              )}
            </Card>
          )}
        </section>
      </div>
    </div>
  );
}
