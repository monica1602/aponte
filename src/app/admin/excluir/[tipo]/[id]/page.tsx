import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { DELETE_KINDS, DELETE_KIND_PT, DELETE_REASON_MAX, deletionPreview, type DeleteKind } from "@/lib/admin-delete";
import { adminDelete } from "@/lib/actions";
import { AdminNav } from "@/components/admin-nav";
import { Card, Flash, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — excluir" };

export default async function AdminDeletePage({ params, searchParams }: { params: Promise<{ tipo: string; id: string }>; searchParams: Promise<{ msg?: string; error?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { tipo, id } = await params;
  if (!DELETE_KINDS.includes(tipo as DeleteKind)) notFound();
  const kind = tipo as DeleteKind;
  const preview = await deletionPreview(kind, Number(id));
  if (!preview) notFound();
  const removed = preview.removed.filter((r) => r.n > 0);
  return (
    <div className="py-8">
      <AdminNav current={preview.list} />
      <Link href={preview.back} className="text-sm text-muted hover:text-fg">← Voltar sem excluir</Link>
      <h1 className="mt-3 text-2xl font-bold [overflow-wrap:anywhere]">Excluir {DELETE_KIND_PT[kind].toLowerCase()}: {preview.title}</h1>
      <p className="mb-6 text-sm text-muted [overflow-wrap:anywhere]">{preview.subtitle}</p>
      <Flash params={await searchParams} />
      <Card className="max-w-2xl">
        <h2 className="mb-2 font-semibold">O que sai junto</h2>
        {removed.length === 0 ? <p className="text-sm text-muted">Nada alem do proprio cadastro.</p> : (
          <ul className="list-disc space-y-1 pl-5 text-sm">{removed.map((r) => <li key={r.label}>{r.label}: <strong>{r.n}</strong></li>)}</ul>
        )}
        {preview.kept.length > 0 && (
          <><h2 className="mt-4 mb-2 font-semibold">O que continua</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">{preview.kept.map((k) => <li key={k}>{k}</li>)}</ul></>
        )}
        <p className="mt-4 text-sm text-red-300">A exclusao e definitiva. So da para recuperar restaurando o backup diario.</p>
        <form action={adminDelete} className="mt-4 space-y-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={preview.id} />
          <label className="block text-sm">Motivo da exclusao
            <input name="reason" required minLength={3} maxLength={DELETE_REASON_MAX} placeholder="Ex.: cadastro duplicado, e-mail errado, teste" className={`${inputCls} mt-1 w-full`} />
          </label>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirm" value="1" required className="mt-1" />Conferi os itens acima e quero excluir definitivamente.</label>
          <div className="flex flex-wrap gap-3">
            <button className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">Excluir definitivamente</button>
            <Link href={preview.back} className={btnSecondaryCls}>Cancelar</Link>
          </div>
        </form>
      </Card>
    </div>
  );
}
