import { bareUrl, externalHref } from "@/lib/url";
import type { Metadata } from "next";
import Link from "next/link";
import { getDb, getProfile } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { respondCompanyInvite } from "@/lib/actions";
import { Badge, Card, Empty, Flash, PageHeader, btnCls, btnSecondaryCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Empresas — Ponte" };

type Company = { id: number; name: string; headline: string; projects: number; events: number };

type CompanyLink = { id: number; company_id: number; name: string; status: string; message: string };

export default async function EmpresasPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const db = getDb();
  const user = await getSessionUser();
  const links = user && user.role !== "company"
    ? ((await db.prepare(
        `SELECT l.id, l.company_id, u.name, l.status, l.message FROM company_links l JOIN users u ON u.id = l.company_id
         WHERE l.member_id = ? ORDER BY l.status DESC, u.name`
      ).all(user.id)) as unknown as CompanyLink[])
    : [];
  const rows = (await db.prepare(
    `SELECT u.id, u.name, u.headline,
       (SELECT COUNT(*) FROM projects p WHERE p.owner_id = u.id AND p.kind <> 'particular' AND p.status <> 'rascunho') AS projects,
       (SELECT COUNT(*) FROM events e WHERE e.owner_id = u.id) AS events
     FROM users u WHERE u.role = 'company' AND u.account_status = 'active' ORDER BY u.name`
  ).all()) as unknown as Company[];
  const companies = await Promise.all(rows.map(async (c) => ({ ...c, profile: await getProfile(c.id) })));
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Rede" title="Empresas">
        Empresas parceiras que oferecem projetos, eventos e oportunidades para mentores e mentorados.
      </PageHeader>
      <Flash params={sp} />
      {links.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 font-semibold">Suas empresas e convites</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {links.map((l) => (
              <li key={l.id}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/pessoas/${l.company_id}`} className="font-semibold text-accent hover:underline">{l.name}</Link>
                    <Badge kind={l.status} label={l.status === "active" ? "Na rede da empresa" : "Convite recebido"} />
                  </div>
                  {l.message && <p className="mt-2 text-xs text-muted">Mensagem: {l.message}</p>}
                  {l.status === "pending" && (
                    <div className="mt-3 flex gap-2">
                      <form action={respondCompanyInvite}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="accept" /><button className={btnCls}>Aceitar</button></form>
                      <form action={respondCompanyInvite}><input type="hidden" name="id" value={l.id} /><input type="hidden" name="decision" value="decline" /><button className={btnSecondaryCls}>Recusar</button></form>
                    </div>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
      {companies.length === 0 ? <Empty>Nenhuma empresa cadastrada ainda.</Empty> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {companies.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/pessoas/${c.id}`} className="text-lg font-semibold text-accent hover:underline">{c.name}</Link>
                  {c.profile.companyType && <Badge kind="projeto" label={c.profile.companyType} />}
                </div>
                <p className="mt-1 text-xs text-muted">
                  {[c.profile.sector, [c.profile.city, c.profile.state].filter(Boolean).join("/")].filter(Boolean).join(" · ")}
                </p>
                {c.headline && <p className="mt-2 text-sm text-muted">{c.headline}</p>}
                <div className="mt-3 flex flex-wrap gap-3 text-sm">
                  <span className="text-muted">{c.projects} projeto(s)</span>
                  <span className="text-muted">{c.events} evento(s)</span>
                  {c.profile.website && <a href={externalHref(c.profile.website)} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{bareUrl(c.profile.website)}</a>}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
