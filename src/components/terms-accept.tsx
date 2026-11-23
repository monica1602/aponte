"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";

const READ_KEY = "ponte:termos-lidos";

/** Caixa com os Termos: o aceite so e liberado depois de rolar o texto ate o fim. */
export function TermsAccept({ children, title = "Termos de Uso", name = "employment_terms", readKey = READ_KEY, label }: {
  children: ReactNode;
  title?: string;
  name?: string;
  readKey?: string;
  label?: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [read, setRead] = useState(false);

  function check() {
    const el = box.current;
    if (el && el.scrollTop + el.clientHeight >= el.scrollHeight - 4) {
      setRead(true);
      try { sessionStorage.setItem(readKey, "1"); } catch { /* storage indisponivel */ }
    }
  }

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      let done = false;
      try { done = sessionStorage.getItem(readKey) === "1"; } catch { /* storage indisponivel */ }
      if (done) setRead(true);
      else check();
    });
    return () => cancelAnimationFrame(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- confere so ao abrir
  }, [readKey]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div
        ref={box}
        onScroll={check}
        tabIndex={0}
        aria-label={title}
        className="max-h-72 overflow-y-auto rounded-md border border-line bg-raised p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {children}
      </div>
      <label className={`flex items-start gap-2 text-xs leading-relaxed ${read ? "text-muted" : "text-muted/60"}`}>
        <input name={name} type="checkbox" required disabled={!read} className="mt-0.5" />
        {label ?? (
          <span>
          Li e aceito os <Link href="/termos" target="_blank" className="text-accent underline">Termos de Uso</Link>, incluindo que a participacao na Ponte, em eventos ou mentorias, nao cria vinculo empregaticio, promessa de contratacao ou relacao de trabalho.
        </span>
        )}
      </label>
      {!read && <p className="text-xs text-muted">Role os termos ate o fim para poder aceitar.</p>}
    </div>
  );
}
