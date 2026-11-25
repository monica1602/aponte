/** Previa do Vercel: deploy de um branch que nao e a main. Na producao e no computador, falso. */
export function isPreview(): boolean {
  return process.env.VERCEL_ENV === "preview";
}

/** Endereco fixo do site: BASE_URL, ou o dominio de producao que o Vercel informa. Nulo nas previas e no computador. */
export function fixedSiteUrl(): string | null {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
  const prod = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (process.env.VERCEL_ENV === "production" && prod) return `https://${prod.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  return null;
}

/** Endereco do site para links. Na producao e fixo; os cabecalhos do pedido so valem nas previas e no computador. */
export function siteUrlFrom(header: (name: string) => string | null | undefined): string {
  const fixed = fixedSiteUrl();
  if (fixed) return fixed;
  const host = header("x-forwarded-host") ?? header("host") ?? "localhost:3000";
  const proto = header("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
