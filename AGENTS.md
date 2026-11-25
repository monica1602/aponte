<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Deploy oficial

O site público é **https://aponte-eight.vercel.app**: projeto `aponte` na Vercel, com o banco PostgreSQL no Neon.

- **Publicar:** todo push para a `main` do fork `monica1602/aponte` publica em produção. Push para outros branches gera só uma prévia (preview), sem mudar o site.
- **Variáveis** (`DATABASE_URL`, `ADMIN_*`, `RESEND_API_KEY` etc.): Vercel → projeto `aponte` → Settings → Environment Variables. Passo a passo no README, em "Publicar na Vercel".
- **Logs:** Vercel → projeto `aponte` → Logs. As mensagens saem em 1 linha JSON (`src/lib/log.ts`).
- **Disponibilidade e backup:** `.github/workflows/disponibilidade.yml` e `.github/workflows/backup.yml`.
- **Local em modo produção:** `npm run build && npm start` serve `.next/standalone/server.js` em `localhost:3000`. `next start` NÃO funciona com `output: "standalone"`.

- **Ambientes:** desenvolvimento (computador/CI, SQLite ou PostgreSQL vazio), prévia (branch ≠ `main`, banco Neon `ponte-preview` via `STORAGE_DATABASE_URL` (nunca o `DATABASE_URL` real; ver `postgresUrl()` em `src/lib/sql.ts`) só com dados de demo, sem e-mail/WhatsApp, faixa "Ambiente de teste" por `VERCEL_ENV=preview`) e produção (`main`, banco real). Tabela e passo a passo no README, em "Ambientes".

- **Dados de demonstração:** só no computador, nos testes e nas prévias. Produção (`VERCEL_ENV=production`) nunca cria demo, mesmo sem `SEED_DEMO=0` (guardas em `src/lib/db.ts`); as 7 contas de demo foram removidas com `scripts/remover-demo.mjs`.

Alternativa fora da Vercel: Dockerfile pronto (multi-stage, `output: "standalone"`, volume em `/app/data` via `DATABASE_PATH`) para Railway/Render/Fly.io/VPS.
