"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const READ_KEY = "ponte:termos-lidos";

/** Caixa com os Termos: o aceite so e liberado depois de rolar o texto ate o fim. */
export function TermsAccept({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);

  function check() {
    const el = box.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setRead(true);
      try { sessionStorage.setItem(READ_KEY, "1"); } catch { /* storage indisponivel */ }
    }
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      let done = false;
      try { done = sessionStorage.getItem(READ_KEY) === "1"; } catch { /* storage indisponivel */ }
      if (done) setRead(true);
      else check();
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Termos de Uso</p>
      <div
        ref={box}
        onScroll={check}
        tabIndex={0}
        aria-label="Termos de Uso"
        className="max-h-72 overflow-y-auto rounded-md border border-line bg-raised p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </div>
      <label className={`flex items-start gap-2 text-xs leading-relaxed ${read ? "text-muted" : "text-muted/60"}`}>
        <input name="employment_terms" type="checkbox" required disabled={!read} className="mt-0.5" />
        <span>
          Li e aceito os <Link href="/termos" target="_blank" className="text-accent underline">Termos de Uso</Link>, incluindo que a participacao na Ponte, em eventos ou mentorias, nao cria vinculo empregaticio, promessa de contratacao ou relacao de trabalho.
        </span>
      </label>
      {!read && <p className="text-xs text-muted">Role os termos ate o fim para poder aceitar.</p>}
    </div>
  );
}
