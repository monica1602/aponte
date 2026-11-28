import { expect, test } from "@playwright/test";
import { expectFitsMobile, MAIN } from "./helpers";

test("pagina Sobre: aberta a visitantes, pela inicial, pelo menu e pelo rodape", async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Conheça a Ponte" }).click();
  await expect(page).toHaveURL(/\/sobre$/);
  await expect(page.getByRole("heading", { level: 1, name: "Sobre a A Ponte" })).toBeVisible();
  for (const h of ["Missão", "Visão", "Valores", "Propósito"]) await expect(page.getByRole("heading", { level: 2, name: h })).toBeVisible();
  await expect(page.getByRole("list", { name: "Valores" }).locator("li")).toHaveCount(10);
  await expect(page.getByText("Construir pontes que transformam conhecimento em oportunidades")).toBeVisible();
  await expect(page.getByRole("link", { name: "Criar minha conta" })).toBeVisible();

  await page.goto("/eventos");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Sobre" }).click();
  await expect(page).toHaveURL(/\/sobre$/);
  await page.goto("/eventos");
  await page.getByRole("navigation", { name: "Rodape" }).getByRole("link", { name: "Sobre" }).click();
  await expect(page).toHaveURL(/\/sobre$/);
  await expectFitsMobile(page, "/sobre");
});

test("pagina Quem somos: aberta a visitantes, pela pagina Sobre, pelo menu e pelo rodape", async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await page.goto("/sobre");
  await page.getByRole("link", { name: "Conheça quem somos" }).click();
  await expect(page).toHaveURL(/\/quem-somos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Quem somos" })).toBeVisible();
  for (const name of ["Luan Lima", "Mônica Hideco", "Wellington Lacerda"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    const img = page.getByRole("img", { name: `Foto de ${name}` });
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  }
  await expect(page.getByText("Possui experiência como mentor voluntário na Generation Brasil")).toBeVisible();

  await page.goto("/eventos");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Quem somos" }).click();
  await expect(page).toHaveURL(/\/quem-somos$/);

  await page.goto("/eventos");
  await page.getByRole("navigation", { name: "Rodape" }).getByRole("link", { name: "Quem somos" }).click();
  await expect(page).toHaveURL(/\/quem-somos$/);

  await expectFitsMobile(page, "/quem-somos");
});
