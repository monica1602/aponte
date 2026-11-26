import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import pg from "pg";
import { expect, type Page } from "@playwright/test";
import { base32Decode, currentStep, totpAt } from "../src/lib/totp";

export const MAIN = "http://localhost:3100";
export const APROV = "http://localhost:3101";
export const MAIL = `http://127.0.0.1:${process.env.E2E_MAIL_PORT || 3910}`;
export const DEMO_PASSWORD = "Ponte@2026";
export const ADMIN = { email: "admin@e2e.test", password: "Admin@e2e2026" };

/** SQL direto no banco do servidor de teste (so para preparar datas e equipes, sem passar pelas telas). */
export async function sql<T = Record<string, unknown>>(server: "main" | "aprov", query: string, params: unknown[] = []): Promise<T[]> {
  const url = process.env.E2E_DATABASE_URL;
  if (url) {
    const target = new URL(url);
    target.pathname = `${target.pathname}_${server}`;
    const client = new pg.Client({ connectionString: target.toString() });
    await client.connect();
    try {
      let i = 0;
      return (await client.query(query.replace(/\?/g, () => `$${++i}`), params)).rows as T[];
    } finally {
      await client.end();
    }
  }
  const db = new DatabaseSync(path.resolve("e2e/.data", `${server}.db`));
  try {
    const stmt = db.prepare(query);
    return (/^\s*select/i.test(query) ? stmt.all(...(params as never[])) : (stmt.run(...(params as never[])), [])) as T[];
  } finally {
    db.close();
  }
}

/** Data no formato dos eventos ("AAAA-MM-DDTHH:MM", horario de Brasilia), deslocada em minutos a partir de agora. */
export function brt(offsetMin: number): string {
  return new Date(Date.now() - 3 * 3600_000 + offsetMin * 60_000).toISOString().slice(0, 16);
}

export function unique(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/** Espera um e-mail capturado pelo simulador para o endereco e devolve o primeiro link que bate com o padrao. */
export async function mailLink(to: string, pattern: RegExp): Promise<string> {
  let link = "";
  await expect
    .poll(async () => {
      const mails = (await (await fetch(`${MAIL}/mails`)).json()) as unknown[];
      for (const mail of mails.reverse()) {
        const text = JSON.stringify(mail);
        if (!text.includes(to)) continue;
        const found = text.replace(/\\u0026/g, "&").replace(/&amp;/g, "&").match(pattern);
        if (found) {
          link = found[0];
          return true;
        }
      }
      return false;
    }, { timeout: 15_000 })
    .toBe(true);
  return link;
}

/** Rola ate o fim as caixas de texto dos termos, que liberam a caixa de aceite. */
async function readTerms(page: Page) {
  await page.evaluate(() =>
    document.querySelectorAll("div").forEach((d) => {
      if (d.scrollHeight > d.clientHeight + 5 && getComputedStyle(d).overflowY !== "visible") {
        d.scrollTop = d.scrollHeight;
        d.dispatchEvent(new Event("scroll"));
      }
    })
  );
}

export async function acceptTermsIfAsked(page: Page) {
  if (!page.url().includes("/novos-termos")) return;
  await readTerms(page);
  for (const box of await page.locator("input[type=checkbox][name^=accept_]").all()) await box.check();
  await page.getByRole("button", { name: "Aceitar e continuar" }).click();
  await page.waitForURL(/\/dashboard/);
}

export async function login(page: Page, email: string, password = DEMO_PASSWORD) {
  await page.goto("/login");
  await page.locator("input[name=email]").fill(email);
  await page.locator("input[name=password]").fill(password);
  await page.locator("form").filter({ has: page.locator("input[name=password]") }).locator("button[type=submit]").click();
  await page.waitForLoadState("networkidle");
  await acceptTermsIfAsked(page);
}

export async function signup(page: Page, data: { name: string; email: string; password: string; role?: "Sou Mentorado" | "Sou Mentor" | "Sou Empresa" }) {
  await page.goto("/signup");
  const opened = Date.now();
  await page.locator("label").filter({ hasText: new RegExp(`^${data.role ?? "Sou Mentorado"}$`) }).click();
  await page.locator("input[name=name]").fill(data.name);
  await page.locator("input[name=email]").fill(data.email);
  await page.locator("input[name=password]").fill(data.password);
  await page.locator("input[name=confirmation]").fill(data.password);
  await readTerms(page);
  await page.locator("input[name=employment_terms]").check();
  await page.locator("input[name=code_of_conduct]").check();
  await page.locator("input[name=public_profile_consent]").check();
  await page.waitForTimeout(Math.max(0, 3500 - (Date.now() - opened)));
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await page.waitForLoadState("networkidle");
}

/** No celular (390 px), a pagina nao pode ter rolagem lateral. */
export async function expectFitsMobile(page: Page, url?: string) {
  const size = page.viewportSize();
  await page.setViewportSize({ width: 390, height: 844 });
  if (url) await page.goto(url);
  await page.waitForLoadState("networkidle");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect.soft(overflow, `rolagem lateral em ${page.url()}`).toBeLessThanOrEqual(0);
  if (size) await page.setViewportSize(size);
}

/** Codigo do aplicativo para um passo de 30 s ainda nao usado (o site recusa repetir o mesmo passo). */
export async function totpCode(secret: string, lastStep = 0): Promise<string> {
  const step = Math.max(currentStep(), lastStep + 1);
  const waitMs = (step - 1) * 30_000 - Date.now();
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs + 500));
  return totpAt(base32Decode(secret), step);
}

/** Login do admin com os dois fatores obrigatorios: ativa no primeiro acesso e depois usa o codigo. */
export async function adminLogin(page: Page, server: "main" | "aprov" = "main") {
  await page.goto("/admin/login");
  await page.locator("#admin-user").fill(ADMIN.email);
  await page.locator("#admin-pass").fill(ADMIN.password);
  await page.locator("button[type=submit]").click();
  await page.waitForURL(/\/admin\/(login\/codigo|seguranca)/);
  if (page.url().includes("/seguranca")) {
    const secret = ((await page.locator("span.font-mono").first().textContent()) ?? "").replace(/\s/g, "");
    await page.locator("#code").fill(await totpCode(secret));
    await page.getByRole("button", { name: "Ativar" }).click();
    await page.getByRole("button", { name: "Ja guardei os codigos" }).click();
    await expect(page.getByRole("button", { name: "Ja guardei os codigos" })).toBeHidden();
  } else {
    const [row] = await sql<{ secret: string; last_step: number }>(
      server,
      "SELECT secret, last_step FROM admin_2fa WHERE enabled_at IS NOT NULL AND disabled_at IS NULL ORDER BY id DESC LIMIT 1",
    );
    await page.locator("#admin-code").fill(await totpCode(row.secret, Number(row.last_step)));
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL(/\/admin$/);
  }
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
}
