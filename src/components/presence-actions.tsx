import { CheckInButton } from "./check-in-button";
import { CheckOutButton } from "./check-out-button";
import { SafeHomeButton } from "./safe-home-button";
import { confirmSafeHome, selfCheckInEvent, selfCheckOutEvent } from "@/lib/actions";
import { checkInWindow, checkOutOpen, spTime } from "@/lib/event-time";
import { safeHomeOpen } from "@/lib/retention";

export type PresenceReg = {
  id: number; status: string; event_status: string; modality: string; starts_at: string; ends_at: string;
  checked_in_at: string | null; checked_out_at: string | null; safe_home_at: string | null;
};

function at(value: string): string {
  const d = new Date(`${value.replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "" : `em ${d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}`;
}

function CheckIn({ r, returnTo }: { r: PresenceReg; returnTo: string }) {
  if (r.status !== "approved" || r.event_status === "cancelled") return null;
  if (r.checked_in_at) return <p className="mt-2 text-xs text-cyan-300">✓ Check-in feito {at(r.checked_in_at)}</p>;
  const win = checkInWindow(r.starts_at, r.ends_at);
  if (win.state === "before") return <p className="mt-2 text-xs text-muted">O check-in abre em {spTime(win.opens)}.</p>;
  if (win.state === "closed") return <p className="mt-2 text-xs text-muted">Check-in encerrado.</p>;
  return <CheckInButton action={selfCheckInEvent} registrationId={r.id} returnTo={returnTo} />;
}

function CheckOut({ r, returnTo }: { r: PresenceReg; returnTo: string }) {
  if (r.status !== "approved" || !r.checked_in_at || r.event_status === "cancelled") return null;
  if (r.checked_out_at) return <p className="mt-2 text-xs text-cyan-300">✓ Check-out feito {at(r.checked_out_at)}</p>;
  if (!checkOutOpen(r.ends_at)) return null;
  return <CheckOutButton action={selfCheckOutEvent} registrationId={r.id} returnTo={returnTo} />;
}

function SafeHome({ r, returnTo }: { r: PresenceReg; returnTo: string }) {
  if (r.safe_home_at) return <p className="mt-2 text-xs text-emerald-300">✓ Chegada confirmada {at(r.safe_home_at)}</p>;
  if (!["in_person", "hybrid"].includes(r.modality) || !r.checked_in_at || !safeHomeOpen(r.ends_at)) return null;
  return <SafeHomeButton action={confirmSafeHome} registrationId={r.id} returnTo={returnTo} />;
}

/** Check-in, check-out e "Cheguei bem em casa" da propria inscricao, no Painel e em Eventos participantes. */
export function PresenceActions({ r, returnTo }: { r: PresenceReg; returnTo: string }) {
  return <><CheckIn r={r} returnTo={returnTo} /><CheckOut r={r} returnTo={returnTo} /><SafeHome r={r} returnTo={returnTo} /></>;
}
