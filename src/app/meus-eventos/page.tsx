import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DeleteConfirm } from "@/components/delete-confirm";
import { CancelEvent } from "@/components/cancel-event";
import { ParticipantEvents, REGISTRATION_STATUS as STATUS } from "@/components/participant-events";
import { deleteEvent, reviewEventRegistration } from "@/lib/actions";
import { Badge, Card, Empty, Flash, PageHeader, btnSecondaryCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Meus eventos — Ponte" };

type Ev = { id: number; title: string; starts_at: string; modality: string; capacity: number | null; status: string; certificates: number };
type Reg = { id: number; event_id: number; name: string; email: string; role: string; status: string; checked_in_at: string | null; checked_out_at: string | null; safe_home_at: string | null };

function spShort(at: string): string {
  const d = new Date(`${at.replace(" ", "T")}Z`);
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
}

function safeHome(modality: string, r: Reg): string {
  if (modality === "online" || !r.checked_in_at) return "—";
  if (!r.safe_home_at) return "Aguardando";
  const d = new Date(`${r.safe_home_at.replace(" ", "T")}Z`);
  return `Sim, ${d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`;
}

export default async function MeusEventosPage({ searchParams }: { searchParams: Promise<{ msg?: string; error?: string }> }) {
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const db = getDb();
  const events = (await db.prepare("SELECT e.id, e.title, e.starts_at, e.modality, e.capacity, e.status, (SELECT COUNT(*) FROM certificates c WHERE c.event_id = e.id) AS certificates FROM events e WHERE e.owner_id = ? ORDER BY e.starts_at DESC").all(user.id)) as unknown as Ev[];
  const regs = (await db.prepare(
    `SELECT r.id, r.event_id, u.name, u.email, u.role, r.status, r.checked_in_at, r.checked_out_at, r.safe_home_at FROM event_registrations r
     JOIN users u ON u.id = r.user_id JOIN events e ON e.id = r.event_id
     WHERE e.owner_id = ? ORDER BY u.name`
  ).all(user.id)) as unknown as Reg[];
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Minha conta" title={user.role === "mentee" ? "Eventos participantes" : "Meus eventos"}>
        {user.role === "mentee" ? "Eventos em que voce se inscreveu." : "Eventos que voce cadastrou e as pessoas inscritas em cada um."}
      </PageHeader>
      <Flash params={sp} />
      {user.role !== "mentee" && <Link href="/dashboard" className={`${btnSecondaryCls} mb-6`}>Cadastrar evento no painel</Link>}
      {user.role === "mentee" ? (
        <ParticipantEvents userId={user.id} returnTo="/meus-eventos" />
      ) : events.length === 0 ? <Empty>Voce ainda nao cadastrou eventos.</Empty> : (
        <ul className="space-y-4">
          {events.map((e) => {
            const list = regs.filter((r) => r.event_id === e.id);
            return (
              <li key={e.id}>
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2">
                      <Link href={`/eventos/${e.id}`} className="text-lg font-semibold text-accent hover:underline">{e.title}</Link>
                      {e.status === "cancelled" && <Badge kind="cancelled" label="Cancelado" />}
                    </span>
                    <span className="text-xs text-muted">{new Date(e.starts_at).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" })} · {list.length} inscritos{e.capacity ? ` / ${e.capacity} vagas` : ""} · {list.filter((r) => r.status === "approved" && r.checked_in_at).length} de {list.filter((r) => r.status === "approved").length} confirmados fizeram check-in</span>
                  </div>
                  {list.length === 0 ? <p className="mt-3 text-sm text-muted">Nenhuma pessoa inscrita ainda.</p> : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Nome</th><th className="font-medium">Email</th><th className="font-medium">Inscricao</th><th className="font-medium">Check-in</th><th className="font-medium">Check-out</th><th className="font-medium">Chegou bem</th><th className="font-medium">Acoes</th></tr></thead>
                        <tbody>
                          {list.map((r) => (
                            <tr key={r.email} className="border-t border-line">
                              <td className="py-1.5">{r.name}</td>
                              <td className="text-muted">{r.email}</td>
                              <td><Badge kind={r.status} label={STATUS[r.status] ?? r.status} /></td>
                              <td className="text-muted">{r.checked_in_at ? "Sim" : "Nao"}</td>
                              <td className="text-muted">{r.checked_out_at ? spShort(r.checked_out_at) : "Nao"}</td>
                              <td className={r.safe_home_at ? "text-emerald-300" : "text-muted"}>{safeHome(e.modality, r)}</td>
                              <td>{r.status === "requested" && e.status !== "cancelled" && (
                                <form action={reviewEventRegistration} className="flex gap-3">
                                  <input type="hidden" name="registration_id" value={r.id} />
                                  <input type="hidden" name="return" value="/meus-eventos" />
                                  <button name="decision" value="approve" className="text-emerald-300 hover:underline">Aprovar</button>
                                  <button name="decision" value="decline" className="text-red-300 hover:underline">Recusar</button>
                                </form>
                              )}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {e.status !== "cancelled" && (list.length > 0 || Number(e.certificates) > 0) && <CancelEvent eventId={e.id} returnTo="/meus-eventos" className="mt-4" />}
                  {e.status !== "cancelled" && list.length === 0 && Number(e.certificates) === 0 && (
                    <DeleteConfirm action={deleteEvent} fields={{ event_id: e.id, return: "/meus-eventos" }} label="Excluir evento" className="mt-4">
                      O evento e as inscricoes serao apagados. As pessoas inscritas recebem um aviso de cancelamento.
                    </DeleteConfirm>
                  )}
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
