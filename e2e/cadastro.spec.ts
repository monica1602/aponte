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

test("cadastro: robo que envia rapido demais ou preenche o campo escondido e barrado", async ({ page }) => {
  const fill = async (email: string) => {
    await page.goto("/signup");
    await page.locator("input[name=name]").fill("Robo Teste");
    await page.locator("input[name=email]").fill(email);
    await page.locator("input[name=password]").fill("Robo@teste2026");
    await page.locator("input[name=confirmation]").fill("Robo@teste2026");
    await page.evaluate(() => {
      for (const n of ["employment_terms", "code_of_conduct", "public_profile_consent"]) {
        const el = document.querySelector<HTMLInputElement>(`input[name=${n}]`);
        if (el) { el.disabled = false; el.checked = true; }
      }
    });
  };
  const barrado = "Nao foi possivel criar a conta. Aguarde alguns segundos e tente de novo.";

  await fill(`${unique("robo-rapido")}@e2e.test`);
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByText(barrado)).toBeVisible();

  await fill(`${unique("robo-campo")}@e2e.test`);
  await page.evaluate(() => { (document.querySelector("input[name=ponte_campo_extra]") as HTMLInputElement).value = "spam"; });
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: "Criar minha conta" }).click();
  await expect(page.getByText(barrado)).toBeVisible();
  await expect(page).toHaveURL(/\/signup/);
});
