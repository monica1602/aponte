import { getDb } from "@/lib/db";
import { errorFields, log } from "@/lib/log";

const NO_STORE = { "Cache-Control": "no-store" };

/** Usado pela checagem de disponibilidade: responde ok quando o site e o banco funcionam. Nao mostra dados. */
export async function GET() {
  try {
    await Promise.race([
      getDb().prepare("SELECT 1 AS ok").get(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("banco demorou mais de 8 s")), 8_000)),
    ]);
    return Response.json({ status: "ok", banco: "ok" }, { headers: NO_STORE });
  } catch (error) {
    log("error", "saude", "Banco nao respondeu.", errorFields(error));
    return Response.json({ status: "erro", banco: "erro" }, { status: 503, headers: NO_STORE });
  }
}
