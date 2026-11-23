import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { EMAIL_STATUS_PT, listPeople, type Ref, type Role } from "@/lib/admin-data";
import { AdminNav } from "@/components/admin-nav";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

const PAGES: Record<string, { role: Role; title: string }> = {
  mentorados: { role: "mentee", title: "Mentorados" },
  mentores: { role: "mentor", title: "Mentores" },
  empresas: { role: "company", title: "Empresas" },
};

function Refs({ items, kind }: { items: Ref[]; kind: "user" | "project" }) {
  if (!items.length) return <span className="text-muted">—</span>;
  return (
    <ul className="space-y-0.5">
      {items.map((r) => (
        <li key={`${kind}-${r.id}`}>
          {kind === "user"
            ? <Link href={`/admin/usuarios/${r.id}`} className="text-accent hover:underline">{r.name}</Link>
            : <Link href={`/projetos/${r.id}`} className="text-accent hover:underline">{r.name}</Link>}
          {r.extra && <span className="text-xs text-muted"> ({r.extra})</span>}
        </li>
      ))}
    </ul>
  );
}

export default async function AdminListPage({ params, searchParams }: { params: Promise<{ papel: string }>; searchParams: Promise<{ q?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const { papel } = await params;
  const page = PAGES[papel];
  if (!page) notFound();
  const q = ((await searchParams).q ?? "").trim().toLowerCase();
  const people = (await listPeople(page.role)).filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q));
  const cols =
    page.role === "mentee" ? ["Mentores", "Projetos", "Empresas"]
    : page.role === "mentor" ? ["Mentorados", "Projetos", "Empresas"]
    : ["Mentores", "Mentorados", "Projetos que colocou", "Trabalhando junto"];
  return (
    <div className="py-8">
      <AdminNav current={`/admin/${papel}`} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">{page.title} <span className="text-base font-normal text-muted">({people.length})</span></h1>
        <form method="GET" className="flex gap-2">
          <input name="q" defaultValue={q} placeholder="Buscar por nome ou email" aria-label="Buscar" className="rounded-md border border-line bg-raised px-3 py-1.5 text-sm" />
          <button className="rounded-md border border-line px-3 py-1.5 text-sm">Buscar</button>
        </form>
      </div>
      {people.length === 0 ? <Empty>Nenhum cadastro encontrado.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-line text-xs text-muted">
              <tr><th className="p-3 font-medium">Nome</th>{cols.map((c) => <th key={c} className="p-3 font-medium">{c}</th>)}<th className="p-3 font-medium">Cadastro</th></tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-t border-line align-top">
                  <td className="p-3">
                    <Link href={`/admin/usuarios/${p.id}`} className="font-semibold text-accent hover:underline">{p.name}</Link>
                    <p className="text-xs text-muted">{p.email}</p>
                    {p.account_status !== "active" && <p className="text-xs text-amber-300">{p.account_status}</p>}
                    <p className={`text-xs ${p.email_status === "verified" ? "text-emerald-300" : p.email_status === "disputed" ? "text-red-300" : "text-amber-300"}`}>{EMAIL_STATUS_PT[p.email_status] ?? p.email_status}</p>
                  </td>
                  {page.role === "mentee" && <><td className="p-3"><Refs items={p.mentors} kind="user" /></td><td className="p-3"><Refs items={p.projects} kind="project" /></td><td className="p-3"><Refs items={p.companies} kind="user" /></td></>}
                  {page.role === "mentor" && <><td className="p-3"><Refs items={p.mentees} kind="user" /></td><td className="p-3"><Refs items={p.projects} kind="project" /></td><td className="p-3"><Refs items={p.companies} kind="user" /></td></>}
                  {page.role === "company" && <><td className="p-3"><Refs items={p.mentorsLinked} kind="user" /></td><td className="p-3"><Refs items={p.menteesLinked} kind="user" /></td><td className="p-3"><Refs items={p.projects.filter((x) => x.extra === "criou")} kind="project" /></td><td className="p-3"><Refs items={p.jointProjects} kind="project" /></td></>}
                  <td className="p-3 text-xs text-muted">{String(p.created_at).slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
