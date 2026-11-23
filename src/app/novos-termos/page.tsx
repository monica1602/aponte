import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getSessionUser } from "@/lib/auth";
import { acceptLegalUpdates, deleteAccount, logout } from "@/lib/actions";
import { LEGAL_DOC_PATH, LEGAL_DOC_PT, pendingLegalDocs } from "@/lib/legal-acceptance";
import { currentVersion, versionLabel, type LegalDoc } from "@/lib/legal-versions";
import { Card, Flash, btnCls, inputCls } from "@/components/ui";
import { TermsAccept } from "@/components/terms-accept";
import { TERMS_TEXTS } from "@/components/terms-text";
import { PRIVACY_TEXTS } from "@/components/privacy-text";
import { CONDUCT_TEXTS } from "@/components/conduct-text";

export const dynamic = "force-dynamic";

const TEXTS: Record<LegalDoc, Record<number, () => ReactNode>> = { terms: TERMS_TEXTS, privacy: PRIVACY_TEXTS, conduct: CONDUCT_TEXTS };

export default async function NewTermsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");
  if (user.must_change_password) redirect("/primeiro-acesso");
  const pending = await pendingLegalDocs(user.id);
  if (!pending.length) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-2xl py-10">
      <Card>
        <h1 className="text-2xl font-bold">Atualizamos nossos documentos</h1>
        <p className="mt-2 text-sm text-muted">Para continuar usando a Ponte, leia e aceite a versao nova de cada documento abaixo.</p>
        <div className="mt-4"><Flash params={sp} /></div>
        <form action={acceptLegalUpdates} className="mt-4 space-y-6">
          {pending.map((doc) => {
            const v = currentVersion(doc);
            return (
              <section key={doc} className="space-y-2">
                <p className="text-xs text-muted">
                  {versionLabel(v)}. O que mudou: {v.summary}{" "}
                  <Link href={`${LEGAL_DOC_PATH[doc]}#historico`} target="_blank" className="text-accent underline">Ver historico</Link>
                </p>
                <TermsAccept
                  title={LEGAL_DOC_PT[doc]}
                  name={`accept_${doc}`}
                  readKey={`ponte:${doc}-v${v.version}-lido`}
                  label={<span>Li e aceito a versao {v.version} do documento <Link href={LEGAL_DOC_PATH[doc]} target="_blank" className="text-accent underline">{LEGAL_DOC_PT[doc]}</Link>.</span>}
                >
                  {TEXTS[doc][v.version]()}
                </TermsAccept>
              </section>
            );
          })}
          <button className={`${btnCls} w-full`}>Aceitar e continuar</button>
        </form>
        <form action={logout} className="mt-4">
          <button className="w-full cursor-pointer text-sm text-muted hover:text-fg">Nao aceito agora, quero sair</button>
        </form>
        <details className="mt-8 rounded-lg border border-red-400/30 bg-red-400/5 p-5">
          <summary className="cursor-pointer text-sm font-semibold text-red-300">Nao concordo e quero excluir minha conta</summary>
          <form action={deleteAccount} data-no-keep className="mt-4 space-y-4">
            <input type="hidden" name="ret" value="/novos-termos" />
            <p className="text-sm text-muted">
              Isso apaga de forma definitiva sua conta e os dados ligados a ela. Nao da para desfazer.
            </p>
            <input name="password" type="password" required autoComplete="current-password" placeholder="Digite sua senha para confirmar" className={inputCls} />
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="confirm" value="1" required /> Entendo que a exclusao e definitiva.
            </label>
            <button className="rounded-md bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600">Excluir minha conta definitivamente</button>
          </form>
        </details>
      </Card>
    </div>
  );
}
