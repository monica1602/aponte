import { LegalPage } from "@/components/legal-page";
import { PRIVACY_TEXTS } from "@/components/privacy-text";

export default async function PrivacyPage({ searchParams }: { searchParams: Promise<{ versao?: string | string[] }> }) {
  const sp = await searchParams;
  return <LegalPage doc="privacy" path="/privacidade" title="Privacidade e dados" texts={PRIVACY_TEXTS} requested={sp.versao} />;
}
