import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { revokeCertificate, unrevokeCertificate } from "@/lib/actions";
import { certificateTimeline, issuedCertificateEvents, issuedCertificates, receivedCertificates, type CertificateItem, type IssuedFilters } from "@/lib/certificates";
import { historyDate, historyLabel, type HistoryEntry } from "@/lib/certificate-history";
import { revokedDate } from "@/lib/certificate-revoke";
import { formatWorkload } from "@/lib/certificate-themes";
import { brDate } from "@/lib/my-data";
import { CertificateRevoke } from "@/components/certificate-revoke";
import { Badge, Card, Empty, Flash, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Certificados — Ponte" };

function Timeline({ items }: { items: HistoryEntry[] }) {
  if (items.length === 0) return null;
  return (
    <ol aria-label="Linha do tempo" className="space-y-1 border-l border-line pl-3 text-xs text-muted">
      {items.map((h, i) => <li key={i}><span className="text-fg">{historyDate(h.created_at)}</span> · {historyLabel(h)}</li>)}
    </ol>
  );
}

function Status({ c }: { c: CertificateItem }) {
  return c.revoked_at
    ? <Badge kind="revoked" label={`Revogado em ${revokedDate(c.revoked_at)}`} />
    : <Badge kind="approved" label="Valido" />;
}

export default async function CertificadosPage({ searchParams }: { searchParams: Promise<{ aba?: string; q?: string; evento?: string; situacao?: string; msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const canIssue = user.role === "mentor" || user.role === "company";
  const tab = canIssue && sp.aba === "emitidos" ? "emitidos" : "recebidos";
  const filters: IssuedFilters = {
    q: (sp.q ?? "").slice(0, 100),
    event: Number(sp.evento) || 0,
    status: sp.situacao === "valid" || sp.situacao === "revoked" ? sp.situacao : "",
  };
  const list = tab === "emitidos" ? await issuedCertificates(user.id, filters) : await receivedCertificates(user.id);
  const events = tab === "emitidos" ? await issuedCertificateEvents(user.id) : [];
  const timeline = await certificateTimeline(list.map((c) => c.id));
  const tabs = [{ key: "recebidos", label: "Recebidos" }, ...(canIssue ? [{ key: "emitidos", label: "Emitidos nos meus eventos" }] : [])];
  return (
    <div className="pb-8">
      <PageHeader eyebrow="Minha conta" title="Certificados">
        {canIssue ? "Os certificados que voce recebeu e os emitidos nos eventos que voce cadastrou, com a linha do tempo de cada um." : "Os certificados que voce recebeu, com a linha do tempo de cada um."}
      </PageHeader>
      <Flash params={sp} />
      <div role="tablist" className="mb-6 flex gap-2 border-b border-line">
        {tabs.map((t) => (
          <Link key={t.key} role="tab" aria-selected={tab === t.key} href={`/certificados?aba=${t.key}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === t.key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg"}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {tab === "recebidos" ? (
        list.length === 0 ? <Empty>Voce ainda nao recebeu certificados.</Empty> : (
          <div className="space-y-3">
            {list.map((c) => (
              <Card key={c.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">{c.title}</h2>
                    <p className="text-sm text-muted">
                      Emitido em {brDate(c.issued_at)}
                      {formatWorkload(c.workload_minutes) && ` · Carga horaria ${formatWorkload(c.workload_minutes)}`}
                      {c.organizer_name && ` · Organizado por ${c.organizer_name}`}
                      {c.event_id === null && " · Evento excluido"}
                    </p>
                    <p className="font-mono text-xs text-muted">Codigo: {c.verification_code}</p>
                  </div>
                  <Status c={c} />
                </div>
                {c.revoked_at && c.revoke_reason && <p className="text-sm text-red-300">Motivo: {c.revoke_reason}</p>}
                <p className="flex gap-4 text-sm">
                  <Link href={`/certificados/${c.verification_code}`} className="text-accent hover:underline">Ver certificado</Link>
                  {!c.revoked_at && <a href={`/certificados/${c.verification_code}/pdf`} className="text-accent hover:underline">Baixar PDF</a>}
                </p>
                <Timeline items={timeline.get(c.id) ?? []} />
              </Card>
            ))}
          </div>
        )
      ) : (
        <>
          <form aria-label="Filtros de certificados" className="mb-4 grid gap-2 sm:grid-cols-[2fr_2fr_1fr_auto]">
            <input type="hidden" name="aba" value="emitidos" />
            <input name="q" defaultValue={filters.q} placeholder="Nome do participante ou codigo" aria-label="Buscar certificado" className={inputCls} />
            <select name="evento" defaultValue={filters.event || ""} aria-label="Evento" className={inputCls}>
              <option value="">Todos os eventos</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
            <select name="situacao" defaultValue={filters.status} aria-label="Situacao" className={inputCls}>
              <option value="">Todas</option>
              <option value="valid">Validos</option>
              <option value="revoked">Revogados</option>
            </select>
            <button className={btnSecondaryCls}>Filtrar</button>
          </form>
          {list.length === 0 ? <Empty>Nenhum certificado encontrado.</Empty> : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Participante</th><th className="pr-4 font-medium">Evento</th><th className="pr-4 font-medium">Emitido em</th><th className="font-medium">Codigo</th><th className="px-4 font-medium">Situacao</th></tr></thead>
                <tbody>
                  {list.map((c) => (
                    <tr key={c.id} className="border-t border-line align-top">
                      <td className="px-4 py-2">{c.recipient_name}</td>
                      <td className="py-2 pr-4">{c.title}</td>
                      <td className="py-2 pr-4 text-muted">{brDate(c.issued_at)}</td>
                      <td className="py-2 font-mono text-xs">{c.verification_code}</td>
                      <td className="space-y-2 px-4 py-2">
                        <CertificateRevoke id={c.id} code={c.verification_code} revokedAt={c.revoked_at} reason={c.revoke_reason} returnTo="/certificados?aba=emitidos" revoke={revokeCertificate} unrevoke={unrevokeCertificate} />
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted hover:text-fg">Linha do tempo</summary>
                          <div className="mt-2"><Timeline items={timeline.get(c.id) ?? []} /></div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
