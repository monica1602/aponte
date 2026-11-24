import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { listCertificates } from "@/lib/admin-data";
import { adminRevokeCertificate, adminUnrevokeCertificate } from "@/lib/actions";
import { brDate } from "@/lib/my-data";
import { AdminNav } from "@/components/admin-nav";
import { CertificateRevoke } from "@/components/certificate-revoke";
import { Card, Empty, Flash, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

export default async function AdminCertificatesPage({ searchParams }: { searchParams: Promise<{ q?: string; msg?: string; error?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const q = (sp.q ?? "").slice(0, 100);
  const certificates = await listCertificates(q);
  return (
    <div className="py-8">
      <AdminNav current="/admin/certificados" />
      <h1 className="mb-1 text-2xl font-bold">Certificados <span className="text-base font-normal text-muted">({certificates.length}{certificates.length === 200 ? "+" : ""})</span></h1>
      <p className="mb-4 text-sm text-muted">Revogue um certificado emitido por engano ou desfaca a revogacao. A pessoa recebe um aviso.</p>
      <Flash params={sp} />
      <form className="mb-4 flex max-w-lg gap-2">
        <input name="q" defaultValue={q} placeholder="Codigo, nome da pessoa ou evento" aria-label="Buscar certificado" className={inputCls} />
        <button className={btnSecondaryCls}>Buscar</button>
      </form>
      {certificates.length === 0 ? <Empty>Nenhum certificado encontrado.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Pessoa</th><th className="font-medium">Evento</th><th className="font-medium">Emitido em</th><th className="font-medium">Codigo</th><th className="px-4 font-medium">Situacao</th></tr></thead>
            <tbody>
              {certificates.map((c) => (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="px-4 py-2">{c.recipient_name}</td>
                  <td className="py-2">{c.title}</td>
                  <td className="py-2 text-muted">{brDate(c.issued_at)}</td>
                  <td className="py-2 font-mono text-xs">{c.verification_code}</td>
                  <td className="px-4 py-2">
                    {c.revoked_at && <p className="mb-1 text-xs text-muted">Revogado {c.revoked_by === null ? "pela administracao" : "pela organizacao do evento"}</p>}
                    <CertificateRevoke id={c.id} code={c.verification_code} revokedAt={c.revoked_at} reason={c.revoke_reason} revoke={adminRevokeCertificate} unrevoke={adminUnrevokeCertificate} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
