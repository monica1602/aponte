import { expect, test } from "@playwright/test";
import { ADMIN, APROV, expectFitsMobile, login, signup, unique } from "./helpers";

test.use({ baseURL: APROV });

test("aprovacao manual: conta nova fica pendente ate a administracao aprovar", async ({ page, browser }) => {
  const email = `${unique("pendente")}@e2e.test`;
  const password = "Pendente@2026";
  await signup(page, { name: "Caio Pendente", email, password });
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText("Aguarde a aprovacao do administrador")).toBeVisible();

  await login(page, email, password);
  await expect(page.getByText("Seu cadastro esta aguardando aprovacao do administrador.")).toBeVisible();

  const admin = await (await browser.newContext({ baseURL: APROV })).newPage();
  await admin.goto("/admin/login");
  await admin.locator("#admin-user").fill(ADMIN.email);
  await admin.locator("#admin-pass").fill(ADMIN.password);
  await admin.locator("button[type=submit]").click();
  await expect(admin).toHaveURL(/\/admin$/);
  await admin.goto("/admin/cadastros");
  const row = admin.locator("tr, li, div").filter({ hasText: email }).filter({ has: admin.getByRole("button", { name: "Aprovar" }) }).last();
  await row.getByRole("button", { name: "Aprovar" }).click();
  await admin.waitForLoadState("networkidle");
  await expectFitsMobile(admin, "/admin/cadastros");

  await login(page, email, password);
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Caio Pendente" })).toBeVisible();
  await expectFitsMobile(page);
});
