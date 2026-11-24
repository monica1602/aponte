import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmailChange } from "@/lib/actions";
import { emailChangeTarget } from "@/lib/my-data";
import { Card, btnCls } from "@/components/ui";

export const metadata: Metadata = { title: "Confirmar novo e-mail — Ponte" };

const STATUS: Record<string, { title: string; text: string }> = {
  confirmado: { title: "E-mail trocado", text: "Pronto! A partir de agora, use o novo e-mail para entrar na Ponte." },
  vencido: { title: "Link vencido", text: "Este link passou de 24 horas. Entre na sua conta e peca a troca de novo em Meus dados." },
  "em-uso": { title: "E-mail em uso", text: "Este e-mail passou a ser usado por outra conta. O seu e-mail nao foi alterado." },
  invalido: { title: "Link invalido", text: "Este link e invalido ou ja foi usado." },
};

export default async function ConfirmarEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; status?: string }> }) {
  const sp = await searchParams;
  const done = sp.status ? STATUS[sp.status] : undefined;
  const target = !done && sp.token ? await emailChangeTarget(sp.token) : null;
  const shown = done ?? (!target ? STATUS.invalido : target.expired ? STATUS.vencido : null);
  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        {shown ? (
          <>
            <h1 className="text-xl font-bold">{shown.title}</h1>
            <p className="mt-2 text-sm text-muted">{shown.text}</p>
            <p className="mt-4 text-sm"><Link href="/meus-dados" className="text-accent hover:underline">Ir para Meus dados</Link></p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Confirmar novo e-mail</h1>
            <p className="mt-2 text-sm text-muted">
              Ola, {target!.name}! Clique no botao para trocar o e-mail da sua conta para <strong className="text-fg">{target!.new_email}</strong>.
            </p>
            <form action={confirmEmailChange} className="mt-4">
              <input type="hidden" name="token" value={sp.token} />
              <button className={`${btnCls} w-full`}>Confirmar meu novo e-mail</button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
