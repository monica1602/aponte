import { Card } from "@/components/ui";
import { TermsText } from "@/components/terms-text";

export default function TermsPage() {
  return <div className="mx-auto max-w-3xl py-10"><Card><h1 className="text-2xl font-bold">Termos de Uso</h1><div className="mt-5"><TermsText /></div></Card></div>;
}
