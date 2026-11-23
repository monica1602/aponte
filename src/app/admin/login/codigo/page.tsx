import { redirect } from "next/navigation";
import { adminVerifyCode } from "@/lib/actions";
import { hasAdminPending } from "@/lib/auth";
import { Card, Flash, inputCls, btnCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminCodePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!(await hasAdminPending())) redirect("/admin/login?error=Tempo%20esgotado.%20Entre%20de%20novo%20com%20e-mail%20e%20senha.");
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-sm py-10">
      <Card>
        <h1 className="text-xl font-bold">Codigo de verificacao</h1>
        <p className="mt-1 text-sm text-muted">
          Abra o aplicativo de codigos no celular e digite o codigo de 6 digitos da Ponte. Sem o celular, use um dos codigos de recuperacao.
        </p>
        <div className="mt-4">
          <Flash params={sp} />
        </div>
        <form action={adminVerifyCode} className="space-y-4">
          <div>
            <label htmlFor="admin-code" className="mb-1 block text-sm font-medium">Codigo</label>
            <input id="admin-code" name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={20} className={inputCls} />
          </div>
          <button type="submit" className={`${btnCls} w-full`}>
            Entrar
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">Esta tela vale por 5 minutos.</p>
      </Card>
    </div>
  );
}
