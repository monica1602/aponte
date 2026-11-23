import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { EMAIL_STATUS_PT, getPersonDetail, type Ref } from "@/lib/admin-data";
import { AdminNav } from "@/components/admin-nav";
import { Badge, Card, ROLE_LABELS } from "@/components/ui";
import { externalHref } from "@/lib/url";
import { ACCEPTANCE_SOURCE_PT, LEGAL_DOC_PT } from "@/lib/legal-acceptance";
import { CONSENT_PT, CONSENT_SOURCE_PT } from "@/lib/consents";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — dados do cadastro" };

const PROFILE_LABELS: Record<string, string> = {
  tools: "Ferramentas", toolsOther: "Outras ferramentas", learnTools: "Quer aprender", areas: "Areas", help: "Tipos de ajuda",
  days: "Dias disponiveis", periods: "Periodos", sessionDuration: "Duracao da sessao", weeklyHours: "Horas por semana",
  modality: "Modalidade", level: "Nivel", maxMentees: "Maximo de mentorados", goals: "Objetivos", city: "Cidade", state: "Estado",
  linkedin: "LinkedIn", github: "GitHub", portfolio: "Portfolio", companyType: "Tipo de empresa", sector: "Setor", website: "Site",
  cnpj: "CNPJ", responsible: "Responsavel", responsibleRole: "Cargo do responsavel", phone: "Telefone", companySize: "Porte",
};
const USER_LABELS: Record<string, string> = {
  id: "ID", name: "Nome", email: "Email", role: "Tipo", account_status: "Situacao da conta", headline: "Titulo", bio: "Sobre",
  skills: "Habilidades", image_consent: "Autoriza uso de imagem", public_profile_consent: "Perfil publico autorizado",
  public_profile_consent_at: "Perfil publico autorizado em", employment_terms_accepted_at: "Termos aceitos em",
  code_of_conduct_accepted_at: "Codigo de conduta aceito em", must_change_password: "Precisa trocar a senha", created_at: "Cadastrado em",
  email_status: "Confirmacao do e-mail", email_verified_at: "E-mail confirmado em",
};
const LINK_KEYS = new Set(["linkedin", "github", "portfolio", "website"]);

function show(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined || v === "") return "—";
  if (v === 0 || v === 1) return v ? "Sim" : "Nao";
  return String(v);
}

function RefList({ title, items, project }: { title: string; items: Ref[]; project?: boolean }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold">{title} ({items.length})</h3>
      {items.length === 0 ? <p className="text-sm text-muted">—</p> : (
        <ul className="space-y-0.5 text-sm">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={project ? `/projetos/${r.id}` : `/admin/usuarios/${r.id}`} className="text-accent hover:underline">{r.name}</Link>
              {r.extra && <span className="text-xs text-muted"> ({r.extra})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const detail = await getPersonDetail(Number((await params).id));
  if (!detail || !detail.row) notFound();
  const { user, row, contributions, registrations, goals, acceptances, consents } = detail;
  const role = String(user.role);
  const back = role === "mentee" ? "/admin/mentorados" : role === "mentor" ? "/admin/mentores" : "/admin/empresas";
  const profileEntries = Object.entries(row.profile).filter(([, v]) => (Array.isArray(v) ? v.length : v));
  return (
    <div className="py-8">
      <AdminNav current={back} />
      <Link href={back} className="text-sm text-muted hover:text-fg">← Voltar para a lista</Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{String(user.name)}</h1>
        <Badge kind={role} label={ROLE_LABELS[role]} />
        <Link href={`/pessoas/${row.id}`} className="text-sm text-accent hover:underline">Ver perfil publico</Link>
      </div>
      <p className="mb-6 text-xs text-amber-200/80">Dados pessoais protegidos pela LGPD. Use apenas para a gestao da plataforma.</p>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{role === "company" ? "Dados da empresa e da conta" : "Dados pessoais e da conta"}</h2>
          <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5 text-sm">
            {Object.entries(USER_LABELS).filter(([k]) => k in user).map(([k, label]) => (
              <div key={k} className="contents"><dt className="text-muted">{label}</dt><dd className="break-words">{k === "role" ? ROLE_LABELS[role] : k === "email_status" ? (EMAIL_STATUS_PT[String(user[k])] ?? show(user[k])) : show(user[k])}</dd></div>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Perfil detalhado</h2>
          {profileEntries.length === 0 ? <p className="text-sm text-muted">Perfil ainda nao preenchido.</p> : (
            <dl className="grid grid-cols-[160px_1fr] gap-x-3 gap-y-1.5 text-sm">
              {profileEntries.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-muted">{PROFILE_LABELS[k] ?? k}</dt>
                  <dd className="break-words">{LINK_KEYS.has(k) ? <a href={externalHref(String(v))} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{String(v)}</a> : show(v)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Associacoes</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {role === "mentee" && <><RefList title="Mentores" items={[...row.mentors, ...row.companies.filter((c) => row.mentors.every((m) => m.id !== c.id))]} /><RefList title="Projetos" items={row.projects} project /><RefList title="Empresas" items={row.companies} /></>}
            {role === "mentor" && <><RefList title="Mentorados" items={row.mentees} /><RefList title="Projetos" items={row.projects} project /><RefList title="Empresas" items={row.companies} /></>}
            {role === "company" && <><RefList title="Mentores" items={row.mentorsLinked} /><RefList title="Mentorados" items={row.menteesLinked} /><RefList title="Projetos que colocou" items={row.projects.filter((p) => p.extra === "criou")} project /><RefList title="Trabalhando junto" items={row.jointProjects} project /></>}
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Historico de aceites dos documentos</h2>
          {acceptances.length === 0 ? <p className="text-sm text-muted">—</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Documento</th><th className="font-medium">Versao</th><th className="font-medium">Aceito em</th><th className="font-medium">Origem</th></tr></thead>
              <tbody>
                {acceptances.map((a, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">{LEGAL_DOC_PT[a.doc] ?? a.doc}</td><td>{a.version}</td><td>{a.accepted_at}</td><td>{ACCEPTANCE_SOURCE_PT[a.source] ?? a.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Historico de consentimentos</h2>
          {consents.length === 0 ? <p className="text-sm text-muted">—</p> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Consentimento</th><th className="font-medium">Evento</th><th className="font-medium">Situacao</th><th className="font-medium">Data</th><th className="font-medium">Origem</th></tr></thead>
              <tbody>
                {consents.map((c, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className="py-1">{CONSENT_PT[c.consent] ?? c.consent}</td>
                    <td>{c.event_id === null ? "—" : c.event_title ?? "Evento removido"}</td>
                    <td>{Number(c.granted) ? "Concedido" : "Revogado"}</td><td>{c.created_at}</td><td>{CONSENT_SOURCE_PT[c.source] ?? c.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Eventos</h2>
          {(registrations as { id: number; title: string; status: string }[]).length === 0 ? <p className="text-sm text-muted">—</p> : (
            <ul className="space-y-1 text-sm">{(registrations as { id: number; title: string; status: string }[]).map((r) => <li key={r.id}><Link href={`/eventos/${r.id}`} className="text-accent hover:underline">{r.title}</Link> <span className="text-xs text-muted">({r.status})</span></li>)}</ul>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Contribuicoes e metas</h2>
          <ul className="space-y-1 text-sm">
            {(contributions as { title: string; type: string }[]).map((c, i) => <li key={`c${i}`}>{c.title} <span className="text-xs text-muted">({c.type})</span></li>)}
            {(goals as { title: string; status: string }[]).map((g, i) => <li key={`g${i}`}>Meta: {g.title} <span className="text-xs text-muted">({g.status})</span></li>)}
            {(contributions as unknown[]).length + (goals as unknown[]).length === 0 && <li className="text-muted">—</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
