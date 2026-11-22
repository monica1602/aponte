import type { ReactNode } from "react";

/** Botao de exclusao com confirmacao: abre um quadro e exige marcar a caixa antes de apagar. */
export function DeleteConfirm({
  action, fields, label, children, className = "",
}: {
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string | number>;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`rounded-md border border-red-400/30 bg-red-400/5 px-3 py-2 ${className}`}>
      <summary className="cursor-pointer text-sm font-semibold text-red-300">{label}</summary>
      <form action={action} data-no-keep className="mt-3 space-y-3">
        {Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
        <p className="text-sm text-muted">{children}</p>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" name="confirm" value="1" required /> Entendo que a exclusao e definitiva.
        </label>
        <button className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">
          Excluir definitivamente
        </button>
      </form>
    </details>
  );
}
