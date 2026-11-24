import Link from "next/link";
import { adminLogout } from "@/lib/actions";

const ITEMS = [
  { href: "/admin", label: "Painel" },
  { href: "/admin/mentorados", label: "Mentorados" },
  { href: "/admin/mentores", label: "Mentores" },
  { href: "/admin/empresas", label: "Empresas" },
  { href: "/admin/eventos", label: "Eventos" },
  { href: "/admin/cadastros", label: "Cadastros e convites" },
  { href: "/admin/pedidos", label: "Pedidos LGPD" },
  { href: "/admin/seguranca", label: "Seguranca" },
];

export function AdminNav({ current }: { current: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
      <nav aria-label="Administracao" className="flex flex-wrap gap-1">
        <span className="mr-3 self-center font-mono text-xs uppercase tracking-widest text-accent">Admin</span>
        {ITEMS.map((i) => (
          <Link key={i.href} href={i.href} aria-current={current === i.href ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 text-sm ${current === i.href ? "bg-accent/15 text-fg" : "text-muted hover:text-fg"}`}>
            {i.label}
          </Link>
        ))}
      </nav>
      <form action={adminLogout}><button className="cursor-pointer text-sm text-muted hover:text-fg">Sair do admin</button></form>
    </div>
  );
}
