import { adminLogin } from "@/lib/actions";
import { Card, Flash, inputCls, btnCls } from "@/components/ui";

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-sm py-10">
      <Card>
        <h1 className="text-xl font-bold">Administração</h1>
        <p className="mt-1 text-sm text-muted">Acesso restrito, separado da entrada de mentores, mentorados e empresas.</p>
        <div className="mt-4">
          <Flash params={sp} />
        </div>
        <form action={adminLogin} className="space-y-4">
          <div>
            <label htmlFor="admin-user" className="mb-1 block text-sm font-medium">Usuario ou email do administrador</label>
            <input id="admin-user" name="email" type="text" required autoComplete="username" className={inputCls} />
          </div>
          <div>
            <label htmlFor="admin-pass" className="mb-1 block text-sm font-medium">Senha</label>
            <input id="admin-pass" name="password" type="password" required autoComplete="current-password" className={inputCls} />
          </div>
          <button type="submit" className={`${btnCls} w-full`}>
            Entrar
          </button>
        </form>
      </Card>
    </div>
  );
}
