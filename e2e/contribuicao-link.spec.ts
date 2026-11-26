import { expect, test } from "@playwright/test";
import { login, MAIN, sql, unique } from "./helpers";

test("link da contribuicao: recusa formatos perigosos e mostra o dominio no perfil", async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(page, "maria@email.com");
  const add = async (title: string, url: string) => {
    await page.goto("/dashboard");
    const form = page.locator("form").filter({ has: page.locator("select[name=type] option[value=open_source]") });
    await form.locator("input[name=title]").fill(title);
    await form.locator("input[name=url]").fill(url);
    await form.locator("button").click();
  };
  const bad = unique("Contribuicao recusada");
  for (const url of ["//site-falso.com", "javascript:alert(1)", "data:text/html,oi", "/admin"]) {
    await add(bad, url);
    await expect(page.getByText("Link da contribuicao: informe um endereco valido")).toBeVisible();
  }
  expect(await sql("main", "SELECT id FROM contributions WHERE title = ?", [bad])).toHaveLength(0);

  const good = unique("Meu projeto");
  await add(good, "https://www.github.com/maria/projeto");
  await expect(page.getByText("Contribuicao publicada no seu perfil.")).toBeVisible();
  const [row] = await sql<{ user_id: number; url: string }>("main", "SELECT user_id, url FROM contributions WHERE title = ?", [good]);
  expect(row.url).toBe("www.github.com/maria/projeto");
  const legacy = unique("Link antigo");
  await sql("main", "INSERT INTO contributions (user_id, title, url) VALUES (?,?,?)", [row.user_id, legacy, "//site-falso.com"]);

  const visitor = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await visitor.goto(`/pessoas/${row.user_id}`);
  const link = visitor.getByRole("link", { name: `${good} ↗` });
  await expect(link).toHaveAttribute("href", "https://www.github.com/maria/projeto");
  await expect(visitor.locator("li").filter({ hasText: good }).getByText("github.com", { exact: true })).toBeVisible();
  await expect(visitor.getByText(legacy)).toBeVisible();
  await expect(visitor.getByRole("link", { name: new RegExp(legacy) })).toHaveCount(0);
});
