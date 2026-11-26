import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import QRCode from "qrcode";
import { adminLogoutEverywhere, disableAdminTwoFactor, dismissRecoveryCodes, enableAdminTwoFactor } from "@/lib/actions";
import { activeTwoFactor, pendingTwoFactor, recoveryCodesLeft, twoFactorResetOn } from "@/lib/admin-2fa";
import { hasAdminSetup, isAdmin } from "@/lib/auth";
import { otpauthUri } from "@/lib/totp";
import { AdminNav } from "@/components/admin-nav";
import { Card, Flash, inputCls, btnCls, btnSecondaryCls } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminSecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const full = await isAdmin();
  const active = await activeTwoFactor();
  const reset = twoFactorResetOn();
  if (!full && (active || reset || !(await hasAdminSetup()))) redirect("/admin/login");
  const sp = await searchParams;
  const codes = (await cookies()).get("ponte_admin_recovery")?.value?.split(",") ?? [];
  const codeField = (
    <div>
      <label htmlFor="code" className="mb-1 block text-sm font-medium">Codigo de 6 digitos do aplicativo</label>
      <input id="code" name="code" required autoComplete="one-time-code" inputMode="numeric" maxLength={20} className={inputCls} />
    </div>
  );

  let body;
  if (active && codes.length > 0) {
    body = (
      <Card>
        <h2 className="font-semibold">Dois fatores ativados. Guarde os codigos de recuperacao</h2>
        <p className="mt-1 text-sm text-muted">
          Use um destes codigos se perder o celular. Cada um entra uma unica vez. Eles nao aparecem de novo depois que voce sair desta tela.
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-2 font-mono text-sm">
          {codes.map((c) => <li key={c} className="rounded-md border border-line px-3 py-2 text-center">{c}</li>)}
        </ul>
        <form action={dismissRecoveryCodes} className="mt-4">
          <button className={btnCls}>Ja guardei os codigos</button>
        </form>
      </Card>
    );
  } else if (active) {
    body = (
      <Card>
        <h2 className="font-semibold">Dois fatores ligados</h2>
        <p className="mt-1 text-sm text-muted">
          O login da administracao pede o codigo do aplicativo depois da senha. Codigos de recuperacao ainda nao usados: {await recoveryCodesLeft()}.
        </p>
        <p className="mt-2 text-sm text-muted">Trocou de celular? Digite o codigo atual para desligar o aplicativo antigo. Em seguida aparece um novo QR code, e o painel so abre de novo depois de le-lo.</p>
        <form action={disableAdminTwoFactor} className="mt-4 space-y-3">
          {codeField}
          <button className={btnSecondaryCls}>Trocar o aplicativo</button>
        </form>
      </Card>
    );
  } else if (reset) {
    body = (
      <Card>
        <h2 className="font-semibold">Dois fatores desligados pela Vercel</h2>
        <p className="mt-1 text-sm text-muted">
          A configuracao ADMIN_2FA_RESET esta ligada. Remova-a na Vercel e faca um novo deploy para poder ativar os dois fatores de novo.
        </p>
      </Card>
    );
  } else {
    const pending = await pendingTwoFactor();
    const qr = await QRCode.toDataURL(otpauthUri(pending.secret, process.env.ADMIN_EMAIL || "admin"), { margin: 1, width: 220 });
    body = (
      <Card>
        <h2 className="font-semibold">Ativar dois fatores</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-muted">
          <li>Instale no celular um aplicativo de codigos, como Google Authenticator ou Microsoft Authenticator.</li>
          <li>No aplicativo, toque em adicionar e leia o QR code abaixo.</li>
          <li>Digite o codigo de 6 digitos que aparece no aplicativo.</li>
        </ol>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR code para o aplicativo de codigos" width={220} height={220} className="mt-4 rounded-md bg-white" />
        <p className="mt-2 text-xs text-muted">
          Sem camera? Digite esta chave no aplicativo: <span className="font-mono text-fg">{pending.secret.match(/.{1,4}/g)?.join(" ")}</span>
        </p>
        <form action={enableAdminTwoFactor} className="mt-4 space-y-3">
          {codeField}
          <button className={btnCls}>Ativar</button>
        </form>
      </Card>
    );
  }

  return (
    <div className="py-8">
      {full && <AdminNav current="/admin/seguranca" />}
      <h1 className="mb-6 text-2xl font-bold">Seguranca</h1>
      {!full && <p className="mb-4 max-w-lg text-sm text-amber-200/80">Os dois fatores sao obrigatorios. Ative-os para abrir o painel da administracao.</p>}
      <Flash params={sp} />
      <div className="max-w-lg space-y-4">
        {body}
        {full && (
          <Card>
            <h2 className="font-semibold">Sessoes</h2>
            <p className="mt-1 text-sm text-muted">
              A sessao da administracao cai depois de 1 hora sem uso e, no maximo, 8 horas depois do login. Se voce entrou em outro aparelho ou desconfia de acesso indevido, encerre todas, inclusive esta.
            </p>
            <form action={adminLogoutEverywhere} className="mt-4">
              <button className={btnSecondaryCls}>Sair de todos os aparelhos</button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
