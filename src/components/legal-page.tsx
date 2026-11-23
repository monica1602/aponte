import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { LEGAL_VERSIONS, formatLegalDate, resolveVersion, versionLabel, type LegalDoc } from "@/lib/legal-versions";

/** Pagina de documento com versao no topo, aviso de versao antiga e historico de versoes. */
export function LegalPage({ doc, path, title, texts, requested }: {
  doc: LegalDoc;
  path: string;
  title: string;
  texts: Record<number, () => ReactNode>;
  requested?: string | string[];
}) {
  const { version, isCurrent } = resolveVersion(doc, requested);
  const history = [...LEGAL_VERSIONS[doc]].sort((a, b) => b.version - a.version);
  return (
    <div className="mx-auto max-w-3xl py-10">
      <Card>
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-xs text-muted">{versionLabel(version)}</p>
        {!isCurrent && (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
            Esta versao nao esta mais em vigor. <Link href={path} className="underline">Ver a versao em vigor</Link>.
          </p>
        )}
        <div className="mt-5">{texts[version.version]()}</div>
        <section className="mt-8 border-t border-line pt-5 text-sm text-muted">
          <h2 className="font-semibold text-fg">Historico de versoes</h2>
          <ul className="mt-2 space-y-1">
            {history.map((v, i) => (
              <li key={v.version}>
                <Link href={i === 0 ? path : `${path}?versao=${v.version}`} className="text-accent hover:underline">
                  Versao {v.version}
                </Link>{" "}
                — {formatLegalDate(v.effectiveFrom)}{i === 0 ? " (em vigor)" : ""}: {v.summary}
              </li>
            ))}
          </ul>
        </section>
      </Card>
    </div>
  );
}
