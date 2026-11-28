"use client";

import { useActionState } from "react";
import { sendContactMessage } from "@/lib/contact-actions";
import { CONTACT_MAX, CONTACT_TYPES, type ContactState } from "@/lib/contact";
import { btnCls, inputCls } from "@/components/ui";

export function ContactForm({ name = "", email = "" }: { name?: string; email?: string }) {
  const [state, action, pending] = useActionState<ContactState, FormData>(sendContactMessage, {});
  const f = state.fields ?? { name, email, type: CONTACT_TYPES[0], message: "" };
  return (
    <form key={JSON.stringify(state.fields ?? null)} action={action} className="mt-6 space-y-5">
      {state.ok && (
        <p role="status" className="rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200">
          Mensagem enviada. Obrigado pelo contato! Vamos responder no e-mail que você informou.
        </p>
      )}
      {state.error && (
        <p role="alert" className="rounded-md border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200">{state.error}</p>
      )}
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">Nome</span>
        <input name="name" required maxLength={CONTACT_MAX.name} autoComplete="name" defaultValue={f.name} className={inputCls} />
      </label>
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">E-mail</span>
        <input name="email" type="email" required maxLength={CONTACT_MAX.email} autoComplete="email" defaultValue={f.email} className={inputCls} />
      </label>
      <fieldset className="space-y-2 text-sm">
        <legend className="mb-1.5 text-muted">Tipo</legend>
        <div className="flex flex-wrap gap-2">
          {CONTACT_TYPES.map((t) => (
            <label
              key={t}
              className="cursor-pointer rounded-full border border-line px-4 py-1.5 text-muted transition-colors hover:border-fg/40 hover:text-fg has-checked:border-accent has-checked:bg-accent has-checked:font-medium has-checked:text-ink has-focus-visible:ring-2 has-focus-visible:ring-accent/60"
            >
              <input type="radio" name="type" value={t} defaultChecked={f.type === t} className="sr-only" />
              {t}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">Descrição</span>
        <textarea name="message" required maxLength={CONTACT_MAX.message} rows={6} defaultValue={f.message} className={`${inputCls} resize-y`} />
      </label>
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>Site<input name="website" tabIndex={-1} autoComplete="off" /></label>
      </div>
      <button disabled={pending} className={`${btnCls} px-7 py-3 disabled:opacity-60`}>{pending ? "Enviando..." : "Enviar mensagem"}</button>
      <p className="text-xs text-muted/70">Seus dados são usados só para responder a sua mensagem.</p>
    </form>
  );
}
