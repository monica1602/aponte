import Link from "next/link";
import { REVOKE_REASONS, revokedDate } from "@/lib/certificate-revoke";
import { Badge, inputCls } from "./ui";

type Action = (formData: FormData) => Promise<void>;

/** Revogar ou desfazer a revogacao de um certificado, com o motivo da lista. */
export function CertificateRevoke({ id, code, revokedAt, reason, returnTo, revoke, unrevoke }: {
  id: number; code: string; revokedAt: string | null; reason: string | null; returnTo?: string; revoke: Action; unrevoke: Action;
}) {
  const hidden = <><input type="hidden" name="certificate_id" value={id} />{returnTo && <input type="hidden" name="return" value={returnTo} />}</>;
  return (
    <div className="space-y-1 text-xs">
      <p className="flex flex-wrap items-center gap-2">
        <Link href={`/certificados/${code}`} className="text-accent hover:underline">Ver certificado</Link>
        {revokedAt && <><Badge kind="revoked" label="Revogado" /><span className="text-muted">em {revokedDate(revokedAt)}{reason ? ` · ${reason}` : ""}</span></>}
      </p>
      {revokedAt ? (
        <form action={unrevoke}>{hidden}<button className="text-accent hover:underline">Desfazer revogacao</button></form>
      ) : (
        <details>
          <summary className="cursor-pointer text-red-300 hover:underline">Revogar certificado</summary>
          <form action={revoke} className="mt-2 grid max-w-xs gap-2">
            {hidden}
            <select name="reason" required defaultValue="" aria-label="Motivo da revogacao" className={inputCls}>
              <option value="" disabled>Motivo</option>
              {REVOKE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <textarea name="details" rows={2} maxLength={500} placeholder="Detalhes (obrigatorio em Outro)" aria-label="Detalhes do motivo" className={inputCls} />
            <button className="justify-self-start rounded-md border border-red-400/40 px-3 py-1 text-red-300 hover:bg-red-400/10">Confirmar revogacao</button>
          </form>
        </details>
      )}
    </div>
  );
}
