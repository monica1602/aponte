import { expect, test, type Browser, type Page } from "@playwright/test";
import { expectFitsMobile, login, MAIN, sql, unique } from "./helpers";

const VISIBILITIES = { public: "Publico", members: "So para cadastrados", open: "Open source", private: "Particular" } as const;
type Visibility = keyof typeof VISIBILITIES;

async function as(browser: Browser, email?: string): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  if (email) await login(page, email);
  return page;
}

async function status(page: Page, id: number): Promise<number> {
  return (await page.goto(`/projetos/${id}`))!.status();
}

test("privacidade de projetos: visitante, pessoa cadastrada e pessoa da equipe", async ({ browser }) => {
  const ana = await as(browser, "ana@ponte.dev");
  const ids = {} as Record<Visibility, number>;
  const titles = {} as Record<Visibility, string>;
  for (const v of Object.keys(VISIBILITIES) as Visibility[]) {
    titles[v] = unique(`Projeto ${v}`);
    await ana.goto("/projetos/novo");
    await ana.locator("input[name=title]").fill(titles[v]);
    await ana.locator("textarea[name=description]").fill("Projeto criado pelo teste de privacidade.");
    await ana.locator("input[name=kind][value=educacional]").check();
    await ana.locator("input[name=visibility][value=" + v + "]").check();
    await ana.locator("input[name=tools]").first().check();
    await ana.getByRole("button", { name: "Criar projeto" }).click();
    await expect(ana).toHaveURL(/\/projetos\/\d+/);
    await expect(ana.getByText(`Projeto criado com visibilidade "${VISIBILITIES[v]}"`)).toBeVisible();
    ids[v] = Number(ana.url().match(/\/projetos\/(\d+)/)![1]);
  }
  await expectFitsMobile(ana, `/projetos/${ids.private}`);

  const visitor = await as(browser);
  expect(await status(visitor, ids.public)).toBe(200);
  expect(await status(visitor, ids.open)).toBe(200);
  await visitor.goto(`/projetos/${ids.members}`);
  await expect(visitor.getByText("Entre para ver este projeto.")).toBeVisible();
  await expect(visitor.getByText(titles.members)).toHaveCount(0);
  expect(await status(visitor, ids.private)).toBe(404);
  await visitor.goto("/projetos");
  await expect(visitor.getByText(titles.public)).toBeVisible();
  await expect(visitor.getByText(titles.members)).toHaveCount(0);
  await expect(visitor.getByText(titles.private)).toHaveCount(0);
  await expectFitsMobile(visitor, `/projetos/${ids.public}`);

  const maria = await as(browser, "maria@email.com");
  expect(await status(maria, ids.public)).toBe(200);
  expect(await status(maria, ids.open)).toBe(200);
  expect(await status(maria, ids.members)).toBe(200);
  await expect(maria.getByText(titles.members).first()).toBeVisible();
  expect(await status(maria, ids.private)).toBe(404);
  await maria.goto("/projetos");
  await expect(maria.getByText(titles.members)).toBeVisible();
  await expect(maria.getByText(titles.private)).toHaveCount(0);

  const pedroId = Number((await sql<{ id: number }>("main", "SELECT id FROM users WHERE email = ?", ["pedro@email.com"]))[0].id);
  await sql("main", "INSERT INTO project_applications (project_id, user_id, status) VALUES (?, ?, 'accepted')", [ids.private, pedroId]);
  const pedro = await as(browser, "pedro@email.com");
  expect(await status(pedro, ids.private)).toBe(200);
  await expect(pedro.getByText(titles.private).first()).toBeVisible();
  await expectFitsMobile(pedro);
  expect(await status(maria, ids.private)).toBe(404);
});
