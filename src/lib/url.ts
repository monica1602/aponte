export const LINK_RE = /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?([/?#]\S*)?$/i;

/** Domain shown next to a link ("github.com"), or "" when the stored address is not a valid site address. */
export function linkHost(v: string | undefined | null): string {
  const t = (v ?? "").trim();
  if (!t || !LINK_RE.test(t)) return "";
  return bareUrl(t).split(/[/?#:]/)[0].toLowerCase().replace(/^www\./, "");
}

/** Address as the user typed it, without the http(s):// prefix. */
export function bareUrl(v: string | undefined | null): string {
  return (v ?? "").replace(/^https?:\/\//i, "");
}

/** Clickable href for an address that may have been stored without a scheme. */
export function externalHref(v: string | undefined | null): string {
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}
