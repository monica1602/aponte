import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { answerDataRequest } from "@/lib/actions";
import { REQUEST_KIND_PT, allDataRequests, brDate, requestDeadline } from "@/lib/my-data";
import { AdminNav } from "@/components/admin-nav";
import { Card, Empty, Flash, btnCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

export default async function AdminPedidosPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const requests = await allDataRequests();
  const today = new Date().toISOString().slice(0, 10);
  const open = requests.filter((r) => r.status === "open").length;
  return (
    <div className="py-8">
      <AdminNav current="/admin/pedidos" />
      <h1 className="mb-1 text-2xl font-bold">Pedidos LGPD <span className="text-base font-normal text-muted">({open} em aberto)</span></h1>
      <p className="mb-4 text-sm text-muted">Pedidos de confirmacao, acesso, correcao e eliminacao de dados. A resposta completa deve sair em ate 15 dias.</p>
      <Flash params={sp} />
      {requests.length === 0 ? <Empty>Nenhum pedido recebido.</Empty> : (
        <div className="space-y-4">
          {requests.map((r) => {
            const deadline = requestDeadline(r.created_at);
            const late = r.status === "open" && deadline < today;
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-semibold">{REQUEST_KIND_PT[r.kind] ?? r.kind}</p>
                  <p className={`text-xs ${late ? "font-semibold text-red-300" : "text-muted"}`}>
                    {r.status === "done" ? `Respondido em ${brDate(r.answered_at ?? "")}` : `${late ? "Prazo vencido" : "Prazo"}: ${brDate(deadline)}`}
                  </p>
                </div>
                <p className="mt-1 text-sm text-muted">
                  <Link href={`/admin/usuarios/${r.user_id}`} className="text-accent hover:underline">{r.user_name}</Link> · {r.user_email} · enviado em {brDate(r.created_at)}
                </p>
                {r.message && <p className="mt-3 whitespace-pre-line text-sm">{r.message}</p>}
                {r.status === "done" ? (
                  <p className="mt-3 whitespace-pre-line rounded bg-accent/10 p-2 text-sm"><span className="font-medium">Resposta:</span> {r.response}</p>
                ) : (
                  <form action={answerDataRequest} className="mt-3 space-y-2">
                    <input type="hidden" name="id" value={r.id} />
                    <textarea name="response" rows={3} required maxLength={4000} placeholder="Resposta para a pessoa" className={inputCls} />
                    <button className={btnCls}>Responder e concluir</button>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
