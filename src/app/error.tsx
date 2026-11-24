"use client";

import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="py-24 text-center">
      <p className="font-mono text-sm text-accent">Erro</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight">Algo deu errado</h1>
      <p className="mt-3 text-muted">Nao conseguimos abrir esta pagina agora. O erro foi registrado para a equipe da Ponte.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Codigo do erro: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => retry()} className="inline-flex rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-ink hover:bg-accent-strong">
          Tentar de novo
        </button>
        <Link href="/" className="inline-flex rounded-md border border-line px-5 py-2.5 text-sm font-medium text-fg transition-colors hover:border-fg/40 hover:bg-raised">
          Voltar ao inicio
        </Link>
      </div>
    </div>
  );
}
