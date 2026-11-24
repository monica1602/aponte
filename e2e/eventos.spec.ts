import { expect, test, type Browser, type Page } from "@playwright/test";
import { brt, expectFitsMobile, login, MAIN, sql, unique } from "./helpers";

test.describe.configure({ mode: "serial" });

const title = unique("Encontro E2E");
let eventId = 0;
let certificateUrl = "";

async function as(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(page, email);
  return page;
}

function organizerRow(page: Page) {
  return page.locator("li").filter({ hasText: title }).locator("li").filter({ hasText: "Maria Clara" });
}

test("eventos: criar, inscrever, aprovar, check-in, check-out e Cheguei bem em casa", async ({ browser }) => {
  const carlos = await as(browser, "carlos@ponte.dev");
  const form = carlos.locator("form").filter({ has: carlos.locator("input[name=starts_at]") });
  await form.locator("input[name=title]").fill(title);
  await form.locator("select[name=modality]").selectOption("in_person");
  await form.locator("input[name=starts_at]").fill(brt(-10));
  await form.locator("input[name=ends_at]").fill(brt(60));
  await form.locator("input[name=location]").fill("Rua dos Testes, 100");
  await form.locator("input[name=require_approval]").check();
  await form.getByRole("button", { name: "Publicar evento" }).click();
  await expect(carlos.getByText("Evento publicado e pronto para receber inscricoes.")).toBeVisible();
  eventId = Number((await sql<{ id: number }>("main", "SELECT id FROM events WHERE title = ?", [title]))[0].id);
  expect(eventId).toBeGreaterThan(0);

  const maria = await as(browser, "maria@email.com");
  await maria.goto(`/eventos/${eventId}`);
  await expectFitsMobile(maria);
  const request = maria.locator("form").filter({ has: maria.locator("input[name=lgpd]") });
  await request.locator("input[name=lgpd]").check();
  await request.getByRole("button", { name: "Solicitar inscricao" }).click();
  await maria.waitForLoadState("networkidle");
  await maria.goto("/dashboard");
  const mine = maria.locator("li").filter({ hasText: title });
  await expect(mine.getByText("aguardando")).toBeVisible();

  await carlos.goto("/dashboard");
  await organizerRow(carlos).getByRole("button", { name: "aprovar" }).click();
  await expect(organizerRow(carlos).getByText("confirmado")).toBeVisible();

  await maria.goto("/dashboard");
  await expect(mine.getByText("confirmado")).toBeVisible();
  await mine.getByRole("button", { name: "Fazer check-in" }).click();
  await expect(maria.getByText("Check-in registrado.")).toBeVisible();
  await mine.getByRole("button", { name: "Fazer check-out" }).click();
  await expect(maria.getByText("Check-out registrado.")).toBeVisible();
  await mine.getByRole("button", { name: "Cheguei bem em casa" }).click();
  await maria.waitForLoadState("networkidle");
  await expectFitsMobile(maria, "/dashboard");

  await carlos.goto("/dashboard");
  await expect(organizerRow(carlos).getByText(/chegou bem/)).toBeVisible();
  await expect(carlos.locator("li").filter({ hasText: title }).getByText("1 de 1 confirmado(s) fizeram check-in")).toBeVisible();
  await expectFitsMobile(carlos);
});

test("certificados: emitir, abrir o PDF, verificar, revogar e ver Revogado", async ({ browser, request }) => {
  await sql("main", "UPDATE events SET starts_at = ?, ends_at = ? WHERE id = ?", [brt(-180), brt(-150), eventId]);

  const carlos = await as(browser, "carlos@ponte.dev");
  await organizerRow(carlos).getByRole("button", { name: "emitir certificado" }).click();
  await expect(carlos).toHaveURL(/\/certificados\/[^/]+$/);
  certificateUrl = carlos.url();

  const visitor = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await visitor.goto(certificateUrl);
  await expect(visitor.getByText("Certificado verificado")).toBeVisible();
  await expect(visitor.getByText("Maria Clara").first()).toBeVisible();
  await expectFitsMobile(visitor);

  const pdf = await request.get(`${certificateUrl}/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await carlos.goto("/dashboard");
  const row = organizerRow(carlos);
  await row.getByText("Revogar certificado").click();
  await row.locator("select[name=reason]").selectOption("Emitido por engano");
  await row.getByRole("button", { name: "Confirmar revogacao" }).click();
  await carlos.waitForLoadState("networkidle");

  await visitor.goto(certificateUrl);
  await expect(visitor.getByText("Certificado revogado").first()).toBeVisible();
  await expect(visitor.getByText("Este certificado nao e valido.")).toBeVisible();
  await expect(visitor.getByRole("link", { name: "Baixar PDF" })).toHaveCount(0);
  await expectFitsMobile(visitor);
});
