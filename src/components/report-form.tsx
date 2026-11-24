import { submitReport } from "@/lib/actions";
import { REPORT_DETAILS_MAX, REPORT_REASONS, type ReportTarget } from "@/lib/moderation";
import { btnSecondaryCls, inputCls } from "@/components/ui";

export function ReportForm({ type, id, ret, label = "Denunciar" }: { type: ReportTarget; id: number; ret: string; label?: string }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer list-none text-xs text-muted hover:text-red-300">{label}</summary>
      <form action={submitReport} className="mt-2 max-w-md space-y-2 rounded-lg border border-line bg-surface p-3">
        <input type="hidden" name="target_type" value={type} />
        <input type="hidden" name="target_id" value={id} />
        <input type="hidden" name="return" value={ret} />
        <select name="reason" required defaultValue="" aria-label="Motivo da denuncia" className={inputCls}>
          <option value="" disabled>Motivo</option>
          {Object.entries(REPORT_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <textarea name="details" rows={3} maxLength={REPORT_DETAILS_MAX} aria-label="Descricao" placeholder="Descreva o que aconteceu (obrigatorio em Outro)" className={inputCls} />
        <p className="text-xs text-muted">A denuncia vai para a administracao, que analisa com base no Codigo de Conduta. A pessoa nao fica sabendo quem denunciou.</p>
        <button className={btnSecondaryCls}>Enviar denuncia</button>
      </form>
    </details>
  );
}
