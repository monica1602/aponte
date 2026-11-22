import { redirect } from "next/navigation";
import { PASSWORD_HINT } from "@/lib/password-policy";
import { getSessionUser } from "@/lib/auth";
import { changeInitialPassword } from "@/lib/actions";
import Link from "next/link";
import { Card, Flash, btnCls, inputCls } from "@/components/ui";

export default async function FirstAccessPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [user, sp] = await Promise.all([getSessionUser(), searchParams]);
  if (!user) redirect("/login");
  if (!user.must_change_password) redirect("/dashboard");
  const termsDone = !!user.code_of_conduct_accepted_at && !!user.public_profile_consent;
  return <div className="mx-auto max-w-md py-12"><Card><h1 className="text-xl font-bold">{termsDone ? "Atualize sua senha" : "Defina sua senha"}</h1><p className="mt-2 text-sm text-muted">{termsDone ? "A Ponte passou a exigir senhas mais seguras. Para continuar, crie uma nova senha." : "Seu mentor criou este acesso com uma senha temporaria. Para continuar, crie uma senha pessoal."} {PASSWORD_HINT}</p><div className="mt-4"><Flash params={sp} /></div><form action={changeInitialPassword} className="mt-4 space-y-3"><input name="password" type="password" minLength={8} required placeholder="Nova senha" className={inputCls}/><input name="confirmation" type="password" minLength={8} required placeholder="Confirme a nova senha" className={inputCls}/>{!termsDone && <><label className="flex items-start gap-2 text-xs leading-relaxed text-muted"><input name="employment_terms" type="checkbox" required className="mt-0.5"/><span>Estou ciente de que a participacao na Ponte nao cria vinculo empregaticio ou promessa de contratacao.</span></label><label className="flex items-start gap-2 text-xs leading-relaxed text-muted"><input name="code_of_conduct" type="checkbox" required className="mt-0.5"/><span>Li e aceito o <Link href="/conduta" className="text-accent underline">Codigo de Conduta</Link>.</span></label><label className="flex items-start gap-2 text-xs leading-relaxed text-muted"><input name="image_consent" type="checkbox" className="mt-0.5"/><span>Autorizo o uso da minha imagem em registros e comunicacoes da Ponte (opcional).</span></label><label className="flex items-start gap-2 text-xs leading-relaxed text-muted"><input name="public_profile_consent" type="checkbox" required className="mt-0.5"/><span>Estou ciente de que meu nome, resumo profissional, bio, habilidades, rede e contribuicoes poderao ficar publicos. Posso alterar isso depois no meu perfil.</span></label></>}<button className={`${btnCls} w-full`}>Salvar e continuar</button></form></Card></div>;
}
