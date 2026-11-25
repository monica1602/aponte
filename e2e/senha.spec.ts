import { expect, test } from "@playwright/test";
import { expectFitsMobile, login, mailLink, MAIN, signup, unique } from "./helpers";

test("redefinicao de senha: link por e-mail, senha nova vale, antiga e link usado nao", async ({ page, context }) => {
  const email = `${unique("senha")}@e2e.test`;
  const oldPassword = "Antiga@2026";
  const newPassword = "NovaSenha@2026";
  await signup(page, { name: "Davi Senha", email, password: oldPassword });
  await context.clearCookies();

  await page.goto("/esqueci-senha");
  await expectFitsMobile(page);
  await page.locator("input[name=email]").fill(email);
  await page.getByRole("button", { name: "Enviar link" }).click();
  await expect(page.getByText("Se este email estiver cadastrado")).toBeVisible();

  const link = await mailLink(email, new RegExp(`${MAIN}/redefinir-senha\\?[^"\\s<\\\\]+`));
  await page.goto(link);
  await expectFitsMobile(page);
  await page.locator("input[name=password]").fill(newPassword);
  await page.locator("input[name=confirmation]").fill(newPassword);
  await page.getByRole("button", { name: "Salvar nova senha" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByText("Senha redefinida.")).toBeVisible();

  await context.clearCookies();
  await login(page, email, oldPassword);
  await expect(page.getByText("Email ou senha incorretos.")).toBeVisible();
  await page.waitForTimeout(2500);
  await login(page, email, newPassword);
  await expect(page).toHaveURL(/\/(dashboard|perfil)/);

  await context.clearCookies();
  await page.goto(link);
  await expect(page.getByText("Este link e invalido, expirou ou ja foi usado.")).toBeVisible();
  await expect(page.locator("input[name=password]")).toHaveCount(0);
});

test("login: depois de errar a senha, a nova tentativa espera alguns segundos", async ({ page }) => {
  const email = `${unique("espera")}@e2e.test`;
  await signup(page, { name: "Caio Espera", email, password: "Espera@2026" });
  await page.context().clearCookies();
  await login(page, email, "Errada@2026");
  await expect(page.getByText("Email ou senha incorretos.")).toBeVisible();
  await login(page, email, "Espera@2026");
  await expect(page.getByText(/Aguarde \d segundos? e tente de novo/)).toBeVisible();
  await page.waitForTimeout(2500);
  await login(page, email, "Espera@2026");
  await expect(page).toHaveURL(/\/(dashboard|perfil)/);
});
