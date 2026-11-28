import { expect, test } from "@playwright/test";
import { login, MAIN, sql } from "./helpers";

test("painel: sugestoes de mentores compativeis, sem vinculos, e aviso de perfil vazio", async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(page, "pedro@email.com");
  const id = async (email: string) => Number((await sql<{ id: number }>("main", "SELECT id FROM users WHERE email = ?", [email]))[0].id);
  const pedro = await id("pedro@email.com");
  const carlos = await id("carlos@ponte.dev");
  const [{ data }] = await sql<{ data: string }>("main", "SELECT data FROM profiles WHERE user_id = ?", [pedro]);
  try {
    await page.goto("/dashboard");
    const list = page.getByRole("list", { name: "Mentores sugeridos para voce" });
    const items = list.locator("li");
    await expect(items.first()).toContainText("Carlos Lima");
    await expect(items.first()).toContainText(/\d+%/);
    expect(await items.count()).toBeLessThanOrEqual(3);
    await expect(list.getByRole("link", { name: "TechCorp" })).toHaveCount(0);
    await items.first().getByRole("link", { name: "Carlos Lima" }).click();
    await expect(page).toHaveURL(new RegExp(`/pessoas/${carlos}$`));

    await sql("main", "INSERT INTO mentorships (mentor_id, mentee_id, status) VALUES (?,?, 'pending')", [carlos, pedro]);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Mentores sugeridos para voce" })).toBeVisible();
    await expect(list.getByRole("link", { name: "Carlos Lima" })).toHaveCount(0);

    await sql("main", "UPDATE profiles SET data = '{}' WHERE user_id = ?", [pedro]);
    await page.goto("/dashboard");
    await expect(page.getByText("Complete seu perfil para receber sugestoes.")).toBeVisible();
  } finally {
    await sql("main", "DELETE FROM mentorships WHERE mentor_id = ? AND mentee_id = ?", [carlos, pedro]);
    await sql("main", "UPDATE profiles SET data = ? WHERE user_id = ?", [data, pedro]);
  }
});
