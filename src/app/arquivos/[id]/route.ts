import { getDb } from "@/lib/db";
import { getSessionUser, isAdmin } from "@/lib/auth";
import { canViewAttachment, getAttachment } from "@/lib/attachments";

export const dynamic = "force-dynamic";

const notFound = () => new Response("Arquivo nao encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await getAttachment(Number(id) || 0);
  if (!a || !(await canViewAttachment(a, await getSessionUser(), await isAdmin()))) return notFound();
  const row = (await getDb().prepare("SELECT data FROM attachments WHERE id = ?").get(a.id)) as { data: string } | undefined;
  if (!row) return notFound();
  const download = new URL(request.url).searchParams.has("baixar");
  return new Response(Buffer.from(row.data, "base64"), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${a.filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; object-src 'self'",
    },
  });
}
