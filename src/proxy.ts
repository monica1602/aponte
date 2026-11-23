import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginRequest } from "@/lib/csrf";

export function proxy(request: NextRequest) {
  const h = request.headers;
  const ok = isSameOriginRequest({
    method: request.method,
    origin: h.get("origin"),
    host: h.get("host"),
    forwardedHost: h.get("x-forwarded-host"),
    secFetchSite: h.get("sec-fetch-site"),
  });
  if (ok) return NextResponse.next();
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Pedido bloqueado - Ponte</title></head>
<body style="font-family:Arial,sans-serif;background:#0b1118;color:#e6edf3;display:flex;justify-content:center;padding:64px 16px">
<div style="max-width:480px"><h1 style="font-size:20px">Pedido bloqueado por seguranca</h1>
<p>Volte a pagina e tente de novo.</p><p><a href="/" style="color:#9db4ff">Ir para a Ponte</a></p></div></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
