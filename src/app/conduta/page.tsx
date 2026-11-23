import { LegalPage } from "@/components/legal-page";
import { CONDUCT_TEXTS } from "@/components/conduct-text";

export default async function CodeOfConductPage({ searchParams }: { searchParams: Promise<{ versao?: string | string[] }> }) {
  const sp = await searchParams;
  return <LegalPage doc="conduct" path="/conduta" title="Codigo de Conduta" texts={CONDUCT_TEXTS} requested={sp.versao} />;
}
