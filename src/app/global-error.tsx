"use client";

import Link from "next/link";

const button = { borderRadius: 6, padding: "10px 20px", fontSize: 14, fontWeight: 600, textDecoration: "none", cursor: "pointer" } as const;

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#071018", color: "#f3f5f5", display: "flex", justifyContent: "center", padding: "96px 16px", textAlign: "center" }}>
        <title>Erro - Ponte</title>
        <div style={{ maxWidth: 480 }}>
          <p style={{ fontFamily: "monospace", fontSize: 14, color: "#9db4ff" }}>Erro</p>
          <h1 style={{ fontSize: 28 }}>Algo deu errado</h1>
          <p style={{ color: "#9ba6a7" }}>Nao conseguimos abrir a Ponte agora. O erro foi registrado para a equipe da Ponte.</p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12, color: "#9ba6a7" }}>Codigo do erro: {error.digest}</p>}
          <div style={{ marginTop: 32, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
            <button type="button" onClick={() => retry()} style={{ ...button, border: 0, background: "#9db4ff", color: "#071018" }}>
              Tentar de novo
            </button>
            <Link href="/" style={{ ...button, border: "1px solid rgba(174, 185, 187, 0.18)", color: "#f3f5f5" }}>
              Voltar ao inicio
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
