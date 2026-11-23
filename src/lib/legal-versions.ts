export type LegalDoc = "terms" | "privacy" | "conduct";
export type LegalVersion = { version: number; effectiveFrom: string; summary: string };

/** Versoes publicadas de cada documento. Uma versao nova entra no fim da lista; as anteriores nunca mudam. */
export const LEGAL_VERSIONS: Record<LegalDoc, LegalVersion[]> = {
  terms: [{ version: 1, effectiveFrom: "2026-11-23", summary: "Primeira versao formal dos Termos de Uso." }],
  privacy: [{ version: 1, effectiveFrom: "2026-11-23", summary: "Texto em vigor quando o versionamento comecou." }],
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
