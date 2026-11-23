import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmail, disputeAccount } from "@/lib/actions";
import { verificationTarget } from "@/lib/email-verification";
import { Card, btnCls } from "@/components/ui";

export const metadata: Metadata = { title: "Confirmar e-mail — Ponte" };

const STATUS: Record<string, { title: string; text: string }> = {
  confirmado: { title: "E-mail confirmado", text: "Obrigado! Sua conta esta confirmada e todas as acoes da Ponte estao liberadas." },
  desativada: { title: "Conta desativada", text: "Obrigado por avisar. A conta criada com o seu e-mail foi desativada, ninguem consegue entrar nela e a administracao da Ponte foi avisada." },
  vencido: { title: "Link vencido", text: "Este link passou de 24 horas. Entre na sua conta e clique em Reenviar e-mail de confirmacao, no topo da pagina." },
  invalido: { title: "Link invalido", text: "Este link e invalido ou ja foi usado." },
};

export default async function VerificarEmailPage({ searchParams }: { searchParams: Promise<{ token?: string; r?: string; status?: string }> }) {
  const sp = await searchParams;
  const done = sp.status ? STATUS[sp.status] : undefined;
  const target = !done && sp.token ? await verificationTarget(sp.token) : null;
  const dispute = sp.r === "nao";
  return (
    <div className="mx-auto max-w-md py-8">
      <Card>
        {done ? (
          <>
            <h1 className="text-xl font-bold">{done.title}</h1>
            <p className="mt-2 text-sm text-muted">{done.text}</p>
            <p className="mt-4 text-sm"><Link href="/" className="text-accent hover:underline">Ir para a Ponte</Link></p>
          </>
        ) : !target ? (
          <>
            <h1 className="text-xl font-bold">{STATUS.invalido.title}</h1>
            <p className="mt-2 text-sm text-muted">{STATUS.invalido.text} Se a sua conta ainda nao estiver confirmada, entre e clique em Reenviar e-mail de confirmacao.</p>
          </>
        ) : dispute ? (
          <>
            <h1 className="text-xl font-bold">Nao foi voce?</h1>
            <p className="mt-2 text-sm text-muted">Alguem criou a conta &quot;{target.name}&quot; na Ponte usando o seu e-mail. Se nao foi voce, desative a conta. Ninguem mais conseguira entrar nela e a administracao sera avisada.</p>
            <form action={disputeAccount} className="mt-4">
              <input type="hidden" name="token" value={sp.token} />
              <button className="w-full rounded-md border border-red-400/40 bg-red-400/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-400/20">Nao fui eu. Desativar esta conta</button>
            </form>
            <p className="mt-3 text-xs text-muted">Foi voce, sim? <Link href={`/verificar-email?token=${sp.token}`} className="text-accent hover:underline">Confirmar meu e-mail</Link></p>
          </>
        ) : target.expired ? (
          <>
            <h1 className="text-xl font-bold">{STATUS.vencido.title}</h1>
            <p className="mt-2 text-sm text-muted">{STATUS.vencido.text}</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold">Confirmar e-mail</h1>
            <p className="mt-2 text-sm text-muted">Ola, {target.name}! Clique no botao para confirmar que foi voce que criou esta conta.</p>
            <form action={confirmEmail} className="mt-4">
              <input type="hidden" name="token" value={sp.token} />
              <button className={`${btnCls} w-full`}>Sim, fui eu. Confirmar meu e-mail</button>
            </form>
            <p className="mt-3 text-xs text-muted">Nao foi voce? <Link href={`/verificar-email?token=${sp.token}&r=nao`} className="text-accent hover:underline">Desativar esta conta</Link></p>
          </>
        )}
      </Card>
    </div>
  );
}
