import { expect, test } from "@playwright/test";
import { expectFitsMobile, mailLink, MAIN, signup, unique } from "./helpers";

test("cadastro: criar conta, receber e-mail, verificar e entrar no Painel", async ({ page }) => {
  const email = `${unique("cadastro")}@e2e.test`;
  await signup(page, { name: "Bianca Teste", email, password: "Cadastro@2026" });
  await expect(page).toHaveURL(/\/perfil/);
  await expect(page.getByText("Conta criada!")).toBeVisible();

  const link = await mailLink(email, new RegExp(`${MAIN}/verificar-email\\?[^"\\s<\\\\]+`));
  await page.goto(link);
  await page.getByRole("button", { name: "Sim, fui eu. Confirmar meu e-mail" }).click();
  await expect(page.getByRole("heading", { name: "E-mail confirmado" })).toBeVisible();

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1, name: "Bianca Teste" })).toBeVisible();
  await expectFitsMobile(page);
  await expectFitsMobile(page, "/signup");
});
