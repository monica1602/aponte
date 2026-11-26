import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { DELETE_KIND_PT, listAllProjects, recentDeletions } from "@/lib/admin-delete";
import { AdminNav } from "@/components/admin-nav";
import { Card, Empty, Flash } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Projetos" };

const KIND: Record<string, string> = { particular: "Particular", open_source: "Open source", educacional: "Educacional", empresarial: "Empresarial" };
const VISIBILITY: Record<string, string> = { public: "Publico", private: "Privado", invite: "So convidados" };

export default async function AdminProjectsPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const projects = await listAllProjects();
  const deletions = await recentDeletions();
  return (
    <div className="py-8">
      <AdminNav current="/admin/projetos" />
      <Flash params={await searchParams} />
      <h1 className="mb-4 text-2xl font-bold">Projetos <span className="text-base font-normal text-muted">({projects.length})</span></h1>
      {projects.length === 0 ? <Empty>Nenhum projeto cadastrado.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr>
                <th className="p-3 font-medium">Projeto</th>
                <th className="p-3 font-medium">Responsavel</th>
                <th className="p-3 font-medium">Tipo</th>
                <th className="p-3 font-medium">Situacao</th>
                <th className="p-3 font-medium">Participantes</th>
                <th className="p-3 font-medium">Criado em</th>
                <th className="p-3 font-medium"><span className="sr-only">Excluir</span></th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-3 [overflow-wrap:anywhere]"><Link href={`/projetos/${p.id}`} className="text-accent hover:underline">{p.title}</Link></td>
                  <td className="p-3"><Link href={`/admin/usuarios/${p.owner_id}`} className="hover:underline">{p.owner_name}</Link></td>
                  <td className="p-3 text-muted">{KIND[p.kind] ?? p.kind}</td>
                  <td className="p-3 text-xs text-muted">{p.status} · {VISIBILITY[p.visibility] ?? p.visibility}</td>
                  <td className="p-3">{p.participants}</td>
                  <td className="p-3 text-xs text-muted">{String(p.created_at).slice(0, 10)}</td>
                  <td className="p-3"><Link href={`/admin/excluir/projeto/${p.id}`} className="text-xs text-red-300 hover:underline">Excluir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      <h2 className="mt-8 mb-2 text-lg font-semibold">Exclusoes feitas pelo admin</h2>
      {deletions.length === 0 ? <Empty>Nenhuma exclusao ainda.</Empty> : (
        <ul className="space-y-1 text-sm">{deletions.map((d, i) => (
          <li key={i} className="[overflow-wrap:anywhere]"><span className="text-xs text-muted">{String(d.deleted_at).slice(0, 16).replace("T", " ")}</span> · {d.detail || DELETE_KIND_PT[d.entity_type]} n. {d.entity_id} · Motivo: {d.reason}</li>
        ))}</ul>
      )}
    </div>
  );
}
