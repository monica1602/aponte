import type { Metadata } from "next";
import { CERTIFICATE_THEMES, validCertificateTheme } from "@/lib/certificate-themes";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getDb, type PlatformEvent } from "@/lib/db";
import { updateEvent } from "@/lib/actions";
import { EVENT_CATEGORIES, MENTEE_EVENT_CATEGORIES } from "@/lib/catalog";
import { eventEnded } from "@/lib/event-time";
import { priceInput } from "@/lib/event-price";
import { EventPricingFields } from "@/components/event-pricing-fields";
import { Card, Flash, PageHeader, btnSecondaryCls, inputCls } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Editar evento — Ponte" };

export default async function EditarEventoPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; error?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const e = (await getDb().prepare("SELECT * FROM events WHERE id = ? AND owner_id = ?").get(Number(id), user.id)) as PlatformEvent | undefined;
  if (!e) redirect("/meus-eventos?error=" + encodeURIComponent("Evento nao encontrado ou voce nao e quem o cadastrou."));
  if (e.status === "cancelled") redirect("/meus-eventos?error=" + encodeURIComponent("Evento cancelado nao pode ser editado."));
  if (eventEnded(e.ends_at)) redirect("/meus-eventos?error=" + encodeURIComponent("O evento ja terminou e nao pode mais ser editado."));
  if (e.approval_status === "rejected") redirect("/meus-eventos?error=" + encodeURIComponent("Evento recusado pela administracao nao pode ser editado."));
  const base = user.role === "mentee" ? MENTEE_EVENT_CATEGORIES : EVENT_CATEGORIES;
  const categories = e.category && !base.includes(e.category) ? [e.category, ...base] : base;
  return (
    <div className="pb-10">
      <PageHeader eyebrow="Meus eventos" title="Editar evento">
        <Link href="/meus-eventos" className="text-accent underline">← Voltar para Meus eventos</Link>
      </PageHeader>
      <Flash params={sp} />
      <Card>
        <p className="text-xs text-muted">Se mudar data, horario, modalidade, link, local ou valor, as pessoas inscritas recebem um aviso.</p>
        <form action={updateEvent} className="mt-3 space-y-3">
          <input type="hidden" name="event_id" value={e.id} />
          <input name="title" required defaultValue={e.title} placeholder="Nome do evento" aria-label="Nome do evento" className={inputCls} />
          <textarea name="description" rows={3} defaultValue={e.description} placeholder="Descricao e orientacoes" aria-label="Descricao" className={inputCls} />
          <div className="grid gap-3 sm:grid-cols-2">
            <select name="modality" aria-label="Modalidade" className={inputCls} defaultValue={e.modality}>
              <option value="online">Online</option>
              <option value="in_person">Presencial</option>
              <option value="hybrid">Hibrido</option>
            </select>
            <input name="capacity" type="number" min="1" defaultValue={e.capacity ?? ""} placeholder="Vagas (opcional)" aria-label="Vagas" className={inputCls} />
            <input name="starts_at" type="datetime-local" required defaultValue={String(e.starts_at).slice(0, 16)} aria-label="Inicio" className={inputCls} />
            <input name="ends_at" type="datetime-local" required defaultValue={String(e.ends_at).slice(0, 16)} aria-label="Termino" className={inputCls} />
          </div>
          <input name="online_url" type="text" inputMode="url" defaultValue={e.online_url} placeholder="Link do encontro online (ex.: meet.google.com/abc-defg-hij)" aria-label="Link do encontro" className={inputCls} />
          <input name="website_url" type="text" inputMode="url" maxLength={500} defaultValue={e.website_url} placeholder="Site oficial do evento (opcional, ex.: lu.ma/meu-evento)" aria-label="Site oficial do evento" className={inputCls} />
          <input name="location" defaultValue={e.location} placeholder="Endereco / local presencial" aria-label="Local" className={inputCls} />
          <div className="grid gap-3 sm:grid-cols-3">
            <select name="category" aria-label="Categoria" className={inputCls} defaultValue={e.category}>
              <option value="">Categoria</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input name="city" defaultValue={e.city} placeholder="Cidade" aria-label="Cidade" className={inputCls} />
            <input name="state" defaultValue={e.state} placeholder="UF" aria-label="Estado (UF)" maxLength={2} className={inputCls} />
          </div>
          <select name="certificate_theme" aria-label="Modelo do certificado" className={inputCls} defaultValue={validCertificateTheme(e.certificate_theme)}>
            {CERTIFICATE_THEMES.map((t) => <option key={t.id} value={t.id}>Certificado: {t.label}</option>)}
          </select>
          <EventPricingFields price={priceInput(e.price_cents)} paymentUrl={e.payment_url} paymentInfo={e.payment_info} />
          <label className="flex items-center gap-2 text-xs text-muted"><input name="require_approval" type="checkbox" defaultChecked={!!e.require_approval} /> Aprovar inscricoes manualmente</label>
          <button className={btnSecondaryCls}>Salvar alteracoes</button>
        </form>
      </Card>
    </div>
  );
}
