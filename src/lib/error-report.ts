import { errorFields, log } from "./log";
import { siteUrlFrom } from "./environment";

export type ErrorRequest = { path: string; method: string };
export type ErrorContext = { routePath?: string; routeType?: string };
export type AlertSender = (text: string, link: string) => Promise<unknown>;

const WINDOW_MIN = 60;
const recent = new Map<string, number>();

const ROUTE_TYPE_PT: Record<string, string> = { render: "pagina", route: "rota", action: "formulario", proxy: "proxy" };

export function pathOnly(path: string): string {
  return path.split(/[?#]/)[0] || "/";
}

/** Tipo do erro: onde ele aconteceu (rota do arquivo, nao o endereco com ids) e a classe do erro. */
export function errorKey(error: unknown, context: ErrorContext): string {
  const name = error instanceof Error ? error.name : typeof error;
  return `${context.routeType ?? "?"}:${context.routePath ?? "?"}:${name}`.slice(0, 200);
}

/** No maximo 1 aviso por tipo de erro a cada hora. Usa o banco para valer entre servidores; sem banco, a memoria. */
async function claimAlert(key: string, now = Date.now()): Promise<boolean> {
  const last = recent.get(key);
  if (last !== undefined && now - last < WINDOW_MIN * 60_000) return false;
  recent.set(key, now);
  try {
    const { blockedFor, recordAttempt } = await import("./rate-limit");
    if (await blockedFor([{ action: "erro-aviso", subject: key, max: 1, windowMin: WINDOW_MIN }])) return false;
    await recordAttempt("erro-aviso", [key]);
  } catch {
    /* banco fora: vale o limite em memoria */
  }
  return true;
}

function adminLink(headers: Record<string, string | string[] | undefined> | undefined): string {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return `${siteUrlFrom((name) => one(headers?.[name]))}/admin`;
}

async function defaultSender(text: string, link: string): Promise<unknown> {
  const { sendAdminAlert } = await import("./admin-alert");
  return sendAdminAlert(text, link);
}

/** Registra o erro do servidor num log estruturado e avisa a administracao, sem dados da pessoa. Nunca lanca erro. */
export async function reportServerError(
  error: unknown,
  request: ErrorRequest & { headers?: Record<string, string | string[] | undefined> },
  context: ErrorContext,
  send: AlertSender = defaultSender
): Promise<void> {
  try {
    const fields = errorFields(error);
    const where = context.routePath ?? pathOnly(request.path);
    log("error", "servidor", "Erro no servidor.", {
      metodo: request.method,
      caminho: pathOnly(request.path),
      rota: context.routePath,
      tipo: context.routeType,
      ...fields,
    });
    if (!(await claimAlert(errorKey(error, context)))) return;
    const kind = ROUTE_TYPE_PT[context.routeType ?? ""] ?? "servidor";
    const code = fields.digest ? ` Codigo ${fields.digest} nos logs do Vercel.` : "";
    await send(`erro no servidor (${kind} ${where}): ${fields.erro}.${code} Avisos iguais ficam pausados por 1 hora.`, adminLink(request.headers));
  } catch {
    /* o registro do erro nunca pode derrubar a resposta */
  }
}
