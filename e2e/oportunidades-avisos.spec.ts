import { expect, test } from "@playwright/test";
import { login, MAIL, MAIN, sql, unique } from "./helpers";

test("oportunidade: avisa no sino quem tem skill em comum, e-mail so para quem quer, e limita o titulo", async ({ browser }) => {
  const ana = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(ana, "ana@ponte.dev");
  const id = async (email: string) => Number((await sql<{ id: number }>("main", "SELECT id FROM users WHERE email = ?", [email]))[0].id);
  const [maria, pedro, joao] = [await id("maria@email.com"), await id("pedro@email.com"), await id("joao@email.com")];
  await sql("main", "UPDATE users SET email_network = 1 WHERE id = ?", [maria]);
  await sql("main", "UPDATE users SET email_network = 0 WHERE id = ?", [pedro]);
  try {
    await ana.goto("/dashboard");
    const form = ana.locator("form").filter({ has: ana.getByPlaceholder("Skills desejadas (virgula)") });

    await form.locator("input[name=title]").fill("x".repeat(151));
    await form.getByRole("button", { name: "Publicar" }).click();
    await expect(ana.getByText("Titulo da oportunidade: use no maximo 150 caracteres")).toBeVisible();

    await ana.goto("/dashboard");
    const title = unique("Vaga de dados");
    await form.locator("input[name=title]").fill(title);
    await form.locator("select[name=type]").selectOption("vaga");
    await form.locator("input[name=skills]").fill("sql, python");
    await form.getByRole("button", { name: "Publicar" }).click();
    await expect(ana.getByText("Oportunidade publicada.")).toBeVisible();

    const [{ id: oppId }] = await sql<{ id: number }>("main", "SELECT id FROM opportunities WHERE title = ?", [title]);
    const link = `/oportunidades#oportunidade-${oppId}`;
    const sent = async (userId: number) => (await sql("main", "SELECT 1 FROM notifications WHERE user_id = ? AND link = ?", [userId, link])).length;
    expect(await sent(maria)).toBe(1);
    expect(await sent(pedro)).toBe(1);
    expect(await sent(joao)).toBe(0);

    await expect.poll(async () => JSON.stringify(await (await fetch(`${MAIL}/mails`)).json()).includes(title), { timeout: 15_000 }).toBe(true);
    const mails = ((await (await fetch(`${MAIL}/mails`)).json()) as unknown[]).map((m) => JSON.stringify(m)).filter((m) => m.includes(title));
    expect(mails.some((m) => m.includes("maria@email.com"))).toBe(true);
    expect(mails.some((m) => m.includes("pedro@email.com"))).toBe(false);

    const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
    await login(page, "maria@email.com");
    await page.goto("/notificacoes");
    const item = page.locator("li").filter({ hasText: `Nova oportunidade compativel: ${title}` });
    await expect(item).toContainText("SQL");
    await item.getByRole("link", { name: "Abrir" }).click();
    await expect(page).toHaveURL(new RegExp(`/oportunidades#oportunidade-${oppId}$`));
    await expect(page.locator(`#oportunidade-${oppId}`)).toContainText(title);
  } finally {
    await sql("main", "UPDATE users SET email_network = 1 WHERE id IN (?, ?)", [maria, pedro]);
  }
});
