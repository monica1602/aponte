import { getSessionUser } from "@/lib/auth";
import { audit } from "@/lib/db";
import { collectMyData } from "@/lib/my-data";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.account_status !== "active") {
    return new Response("Entre na sua conta para baixar seus dados.", { status: 401 });
  }
  const data = await collectMyData(user.id);
  if (!data) return new Response("Conta nao encontrada.", { status: 404 });
  await audit(user.id, "data.exported", "user", user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="meus-dados-ponte.json"',
      "Cache-Control": "private, no-store",
    },
  });
}
