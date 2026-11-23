const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type RequestOrigin = {
  method: string;
  origin: string | null;
  host: string | null;
  forwardedHost: string | null;
  secFetchSite: string | null;
};

/** Unsafe requests must come from this site: matching Origin, or no Origin but `Sec-Fetch-Site: same-origin`. */
export function isSameOriginRequest(r: RequestOrigin): boolean {
  if (!UNSAFE.has(r.method.toUpperCase())) return true;
  if (r.secFetchSite && r.secFetchSite !== "same-origin") return false;
  const host = (r.forwardedHost ?? r.host ?? "").split(",")[0].trim().toLowerCase();
  if (r.origin) {
    try {
      return !!host && new URL(r.origin).host.toLowerCase() === host;
    } catch {
      return false;
    }
  }
  return r.secFetchSite === "same-origin";
}
