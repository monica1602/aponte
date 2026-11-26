export type LegalDoc = "terms" | "privacy" | "conduct";
export type LegalVersion = { version: number; effectiveFrom: string; summary: string };

/** Versoes publicadas de cada documento. Uma versao nova entra no fim da lista; as anteriores nunca mudam. */
export const LEGAL_VERSIONS: Record<LegalDoc, LegalVersion[]> = {
  terms: [
    { version: 1, effectiveFrom: "2026-11-23", summary: "Primeira versao formal dos Termos de Uso." },
    { version: 2, effectiveFrom: "2026-11-26", summary: "Inclui no item 6 (Eventos) as regras de eventos pagos: o pagamento e feito direto com o organizador, que responde pela cobranca e pela devolucao de valores." },
  ],
  privacy: [
    { version: 1, effectiveFrom: "2026-11-23", summary: "Texto em vigor quando o versionamento comecou." },
    { version: 2, effectiveFrom: "2026-11-23", summary: "Inclui a secao Prazos de guarda: auditoria, inscricoes, presenca, confirmacao de chegada e certificados." },
    { version: 3, effectiveFrom: "2026-11-24", summary: "Inclui nos Prazos de guarda as copias de seguranca do banco de dados: 30 dias." },
  ],
  conduct: [{ version: 1, effectiveFrom: "2026-11-23", summary: "Texto em vigor quando o versionamento comecou." }],
};

export function currentVersion(doc: LegalDoc): LegalVersion {
  return LEGAL_VERSIONS[doc].reduce((a, b) => (b.version > a.version ? b : a));
}

/** Versao pedida em ?versao=; uma versao que nao existe cai na versao em vigor. */
export function resolveVersion(doc: LegalDoc, requested?: string | string[]): { version: LegalVersion; isCurrent: boolean } {
  const current = currentVersion(doc);
  const n = Number(Array.isArray(requested) ? requested[0] : requested);
  const found = LEGAL_VERSIONS[doc].find((v) => v.version === n) ?? current;
  return { version: found, isCurrent: found.version === current.version };
}

export function formatLegalDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function versionLabel(v: LegalVersion): string {
  return `Versao ${v.version} — em vigor desde ${formatLegalDate(v.effectiveFrom)}`;
}

export const LEGAL_DOCS: LegalDoc[] = ["terms", "privacy", "conduct"];

/** Documentos cuja versao em vigor e mais nova que a ultima versao aceita. */
export function docsBehind(accepted: Partial<Record<LegalDoc, number>>): LegalDoc[] {
  return LEGAL_DOCS.filter((d) => (accepted[d] ?? 0) < currentVersion(d).version);
}
