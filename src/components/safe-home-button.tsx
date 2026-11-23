"use client";

import { useFormStatus } from "react-dom";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="inline-flex items-center justify-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-70 cursor-pointer"
    >
      {pending ? "Enviando..." : "Cheguei bem em casa"}
    </button>
  );
}

/** Botao de confirmacao de chegada; mostra "Enviando..." enquanto a acao do servidor roda. */
export function SafeHomeButton({ action, registrationId }: { action: (formData: FormData) => Promise<void>; registrationId: number }) {
  return (
    <form action={action} data-no-keep className="mt-2">
      <input type="hidden" name="registration_id" value={registrationId} />
      <Submit />
      <p className="mt-1 text-xs text-muted">Ao confirmar, o organizador e a administracao serao avisados.</p>
    </form>
  );
}
