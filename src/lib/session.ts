import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { siteUrlFrom } from "./environment";
import { getSessionUser } from "./auth";
import type { User } from "./db";
import { pendingLegalDocs } from "./legal-acceptance";

export function back(path: string, key: "msg" | "error", text: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${key}=${encodeURIComponent(text)}`);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "local";
}

export async function siteUrl(): Promise<string> {
  const h = await headers();
  return siteUrlFrom((name) => h.get(name));
}

export const UNVERIFIED_MSG = "Confirme seu e-mail para fazer isso. Use o botao Reenviar e-mail de confirmacao, no topo da pagina.";

/** Accounts that have not confirmed their e-mail yet cannot act on other people. */
export function requireVerified(user: User, ret: string): void {
  if (user.email_status === "pending") back(ret, "error", UNVERIFIED_MSG);
}

export function str(formData: FormData, key: string, max = 2000): string {
  return String(formData.get(key) ?? "").trim().slice(0, max);
}

/** Only keeps values from the allowed list, so forged form values are ignored. */
export function pick(formData: FormData, key: string, allowed: readonly string[]): string[] {
  return formData.getAll(key).map(String).filter((v) => allowed.includes(v));
}

export function one(formData: FormData, key: string, allowed: readonly string[]): string {
  const v = str(formData, key);
  return allowed.includes(v) ? v : "";
}

export function safeReturn(value: string, fallback: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.account_status !== "active") redirect("/login?error=Sua conta ainda nao esta ativa.");
  if (user.must_change_password) redirect("/primeiro-acesso");
  if ((await pendingLegalDocs(user.id)).length) redirect("/novos-termos");
  return user;
}

export function csv(items: string[]): string {
  return items.join(", ");
}

export function splitCsv(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
