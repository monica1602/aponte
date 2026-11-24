import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import { listAllReviews } from "@/lib/reviews";
import { brDate } from "@/lib/my-data";
import { AdminNav } from "@/components/admin-nav";
import { Card, Empty } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Admin — Ponte" };

const yn = (v: number | null) => (v === 1 ? "Sim" : v === 0 ? "Nao" : "—");

export default async function AdminReviewsPage() {
  if (!(await isAdmin())) redirect("/admin/login");
  const reviews = await listAllReviews();
  return (
    <div className="py-8">
      <AdminNav current="/admin/avaliacoes" />
      <h1 className="mb-1 text-2xl font-bold">Avaliacoes <span className="text-base font-normal text-muted">({reviews.length}{reviews.length === 500 ? "+" : ""})</span></h1>
      <p className="mb-4 text-sm text-muted">Todas as avaliacoes de mentorias e eventos, com os nomes. Quem e avaliado ve so resultados agrupados, sem nomes. Os relatos sensiveis ficam em Denuncias.</p>
      {reviews.length === 0 ? <Empty>Nenhuma avaliacao ainda.</Empty> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted"><tr><th className="px-4 py-2 font-medium">Tipo</th><th className="font-medium">Quem avaliou</th><th className="font-medium">Avaliado</th><th className="font-medium">Nota</th><th className="font-medium">Como combinado</th><th className="font-medium">Recomenda</th><th className="font-medium">Comentario</th><th className="px-4 font-medium">Data</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-4 py-2">{r.kind === "event" ? "Evento" : "Mentoria"}</td>
                  <td className="py-2">{r.author_name ?? "Conta excluida"}</td>
                  <td className="py-2">{r.kind === "event" ? (r.event_title ?? "Evento excluido") : (r.subject_name ?? "Conta excluida")}</td>
                  <td className="py-2">{r.rating}</td>
                  <td className="py-2 text-muted">{yn(r.as_agreed)}</td>
                  <td className="py-2 text-muted">{yn(r.recommend)}</td>
                  <td className="max-w-sm whitespace-pre-wrap py-2 [overflow-wrap:anywhere]">{r.comment}</td>
                  <td className="px-4 py-2 text-muted">{brDate(r.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
