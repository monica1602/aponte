import { getDb } from "./db";
import { LEGAL_DOCS, currentVersion, docsBehind, type LegalDoc } from "./legal-versions";

export const LEGAL_DOC_PT: Record<LegalDoc, string> = {
  terms: "Termos de Uso",
  privacy: "Politica de Privacidade",
  conduct: "Codigo de Conduta",
};
export const LEGAL_DOC_PATH: Record<LegalDoc, string> = { terms: "/termos", privacy: "/privacidade", conduct: "/conduta" };

export const ACCEPTANCE_SOURCE_PT: Record<string, string> = {
  cadastro: "Cadastro",
  google: "Cadastro com Google",
  primeiro_acesso: "Primeiro acesso",
  reaceite: "Novo aceite",
  anterior: "Anterior ao versionamento",
};

/** Grava o aceite da versao em vigor; cada aceite e uma linha nova, nunca alterada. */
export async function recordLegalAcceptance(userId: number, source: keyof typeof ACCEPTANCE_SOURCE_PT, docs: LegalDoc[] = LEGAL_DOCS) {
  const db = getDb();
  for (const doc of docs) {
    await db.prepare("INSERT INTO legal_acceptances (user_id, doc, version, source) VALUES (?,?,?,?)")
      .run(userId, doc, currentVersion(doc).version, source);
  }
}

export async function pendingLegalDocs(userId: number): Promise<LegalDoc[]> {
  const rows = (await getDb()
    .prepare("SELECT doc, MAX(version) AS version FROM legal_acceptances WHERE user_id = ? GROUP BY doc")
    .all(userId)) as { doc: LegalDoc; version: number }[];
  return docsBehind(Object.fromEntries(rows.map((r) => [r.doc, Number(r.version)])));
}

/** Usado pelo proxy: a sessao pertence a uma conta que precisa aceitar uma versao nova? */
export async function sessionNeedsReaccept(tokenHash: string): Promise<boolean> {
  const row = (await getDb()
    .prepare(
      `SELECT u.id FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ? AND u.must_change_password = 0 AND u.account_status = 'active'`
    )
    .get(tokenHash, Date.now())) as { id: number } | undefined;
  return !!row && (await pendingLegalDocs(row.id)).length > 0;
}

export async function legalAcceptanceHistory(userId: number) {
  return (await getDb()
    .prepare("SELECT doc, version, source, accepted_at FROM legal_acceptances WHERE user_id = ? ORDER BY accepted_at DESC, id DESC")
    .all(userId)) as { doc: LegalDoc; version: number; source: string; accepted_at: string }[];
}
