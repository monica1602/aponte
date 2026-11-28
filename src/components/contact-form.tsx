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
      <label className="block space-y-1.5 text-sm">
        <span className="text-muted">Tipo</span>
        <span className="relative block">
          <select name="type" required defaultValue={f.type} className={`${inputCls} cursor-pointer appearance-none pr-10`}>
            {CONTACT_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
            <path d="m5 8 5 5 5-5" />
          </svg>
        </span>
      </label>
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
