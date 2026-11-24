import { format } from "node:util";

// Logs estruturados: uma linha JSON por mensagem, sem e-mails, senhas, tokens ou links com codigo.
export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null | undefined>;

const SECRET_KEY = /senha|password|token|secret|segredo|apikey|api_key|authorization|cookie/i;

/** Esconde e-mails, query strings de links, credenciais em URLs, tokens Bearer e sequencias longas que parecem codigos. */
export function mask(text: string): string {
  return text
    .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[oculto]@")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[e-mail]")
    .replace(/\bBearer\s+[^\s"']+/gi, "Bearer [oculto]")
    .replace(/(https?:\/\/[^\s?#"']+|(?:^|(?<=[\s"'(]))\/[^\s?#"']*)\?[^\s#"')]+/g, "$1?[oculto]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[oculto]");
}

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    return { erro: error.name, detalhe: error.message, digest: digest === undefined ? undefined : String(digest) };
  }
  return { erro: typeof error, detalhe: String(error) };
}

export function formatLog(level: LogLevel, area: string, message: string, fields: LogFields = {}, now = new Date()): string {
  const entry: Record<string, string | number | boolean | null> = { ts: now.toISOString(), nivel: level, area, msg: mask(message) };
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || key in entry) continue;
    if (SECRET_KEY.test(key)) entry[key] = "[oculto]";
    else entry[key] = typeof value === "string" ? mask(value) : value;
  }
  return JSON.stringify(entry);
}

export function log(level: LogLevel, area: string, message: string, fields?: LogFields): void {
  const line = formatLog(level, area, message, fields);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

let installed = false;

/** Faz tambem as mensagens do Next.js e das bibliotecas sairem em 1 linha JSON mascarada (area "next"). */
export function installConsoleMask(target: Pick<Console, "log" | "info" | "warn" | "error"> = console): void {
  if (installed && target === console) return;
  if (target === console) installed = true;
  const levels: [keyof typeof target, LogLevel][] = [["log", "info"], ["info", "info"], ["warn", "warn"], ["error", "error"]];
  for (const [method, level] of levels) {
    const original = target[method].bind(target);
    target[method] = (...args: unknown[]) => {
      if (args.length === 1 && typeof args[0] === "string" && args[0].startsWith('{"ts":')) return original(args[0]);
      original(formatLog(level, "next", format(...args)));
    };
  }
}
