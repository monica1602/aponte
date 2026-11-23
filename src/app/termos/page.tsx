import { LegalPage } from "@/components/legal-page";
import { TERMS_TEXTS } from "@/components/terms-text";

export default async function TermsPage({ searchParams }: { searchParams: Promise<{ versao?: string | string[] }> }) {
  const sp = await searchParams;
  return <LegalPage doc="terms" path="/termos" title="Termos de Uso" texts={TERMS_TEXTS} requested={sp.versao} />;
}
