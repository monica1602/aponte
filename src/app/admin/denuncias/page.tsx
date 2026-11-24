import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { adminCloseReport, adminRemoveAttachment, adminReviewReport, adminUnsuspendUser } from "@/lib/actions";
import { REPORT_OUTCOMES, REPORT_REASONS, REPORT_STATUS, REPORT_TARGETS, listReports, type ReportRow } from "@/lib/moderation";
import { brDate } from "@/lib/my-data";
import { AdminNav } from "@/components/admin-nav";
import { Badge, Card, Empty, Flash, btnCls, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

const TARGET_PATH: Record<string, string> = { user: "/pessoas", project: "/projetos", event: "/eventos", attachment: "/arquivos" };

function Target({ r }: { r: ReportRow }) {
  const path = TARGET_PATH[r.target_type];
  return path ? <Link href={`${path}/${r.target_id}`} className="text-accent hover:underline">{r.target_label}</Link> : <span>{r.target_label}</span>;
}

export default async function AdminReportsPage({ searchParams }: { searchParams: Promise<{ situacao?: string; msg?: string; error?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const sp = await searchParams;
  const status = sp.situacao && sp.situacao in REPORT_STATUS ? sp.situacao : "";
  const reports = await listReports(status);
  return (
    <div className="py-8">
      <AdminNav current="/admin/denuncias" />
      <h1 className="mb-1 text-2xl font-bold">Denuncias <span className="text-base font-normal text-muted">({reports.length})</span></h1>
      <p className="mb-4 text-sm text-muted">Analise as denuncias com base no Codigo de Conduta. A pessoa denunciada nunca ve quem denunciou. Nas mensagens, aparece so a copia da mensagem denunciada.</p>
      <Flash params={sp} />
      <nav aria-label="Situacao" className="mb-4 flex flex-wrap gap-2 text-sm">
        {[["", "Todas"], ...Object.entries(REPORT_STATUS)].map(([k, v]) => (
          <Link key={k} href={k ? `/admin/denuncias?situacao=${k}` : "/admin/denuncias"} aria-current={status === k ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 ${status === k ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>{v}</Link>
        ))}
      </nav>
      {reports.length === 0 ? <Empty>Nenhuma denuncia.</Empty> : (
        <div className="space-y-4">
          {reports.map((r) => (
            <Card key={r.id} className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{r.sensitive ? <span className="mr-2 rounded-full border border-red-400/40 bg-red-400/10 px-2 py-0.5 text-xs text-red-300">Relato sensivel</span> : null}{r.sensitive ? "Relato enviado numa avaliacao" : REPORT_REASONS[r.reason] ?? r.reason} · {REPORT_TARGETS[r.target_type]}: <Target r={r} /></p>
                <Badge kind={r.status === "closed" ? "active" : "pending"} label={REPORT_STATUS[r.status]} />
              </div>
              <dl className="grid gap-1 text-muted sm:grid-cols-[160px_1fr]">
                <dt>Recebida em</dt><dd>{brDate(r.created_at)}</dd>
                <dt>Quem denunciou</dt><dd>{r.reporter_id ? <Link href={`/admin/usuarios/${r.reporter_id}`} className="text-accent hover:underline">{r.reporter_name}</Link> : "Conta excluida"}</dd>
                <dt>Pessoa denunciada</dt>
                <dd>{r.target_user_id ? <Link href={`/admin/usuarios/${r.target_user_id}`} className="text-accent hover:underline">{r.target_user_name}</Link> : "Conta excluida"}{r.target_user_status === "suspended" && " (suspensa)"}</dd>
                {r.details && <><dt>Descricao</dt><dd className="whitespace-pre-wrap text-fg [overflow-wrap:anywhere]">{r.details}</dd></>}
                {r.message_body !== null && <><dt>Mensagem denunciada</dt><dd className="whitespace-pre-wrap rounded-md bg-raised px-3 py-2 text-fg [overflow-wrap:anywhere]">{r.message_body}</dd></>}
                {r.target_type === "attachment" && r.status !== "closed" && <><dt>Arquivo</dt><dd><form action={adminRemoveAttachment}><input type="hidden" name="attachment_id" value={r.target_id} /><button className="text-red-300 hover:underline">Remover arquivo</button></form></dd></>}
                {r.status === "closed" && <><dt>Medida</dt><dd>{r.outcome ? REPORT_OUTCOMES[r.outcome] : ""} em {brDate(r.closed_at ?? "")}{r.admin_note && ` · ${r.admin_note}`}</dd></>}
              </dl>
              {r.status !== "closed" && (
                <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
                  {r.status === "open" && (
                    <form action={adminReviewReport}>
                      <input type="hidden" name="report_id" value={r.id} />
                      <button className={btnSecondaryCls}>Marcar em analise</button>
                    </form>
                  )}
                  <form action={adminCloseReport} className="flex flex-1 flex-wrap items-end gap-2">
                    <input type="hidden" name="report_id" value={r.id} />
                    <select name="outcome" required defaultValue="" aria-label="Medida" className={`${inputCls} max-w-56`}>
                      <option value="" disabled>Medida</option>
                      {Object.entries(REPORT_OUTCOMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <input name="note" maxLength={1000} placeholder="Anotacao interna (opcional)" aria-label="Anotacao interna" className={`${inputCls} max-w-xs`} />
                    <button className={btnCls}>Concluir</button>
                  </form>
                </div>
              )}
              {r.target_user_status === "suspended" && r.outcome === "suspended" && (
                <form action={adminUnsuspendUser} className="border-t border-line pt-3">
                  <input type="hidden" name="user_id" value={r.target_user_id ?? 0} />
                  <button className={btnSecondaryCls}>Desfazer suspensao</button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
