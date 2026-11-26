import { expect, test } from "@playwright/test";
import { brt, login, MAIN, sql, unique } from "./helpers";

test("eventos: site oficial opcional, recusado se invalido e visivel para visitantes", async ({ browser }) => {
  const title = unique("Evento com site");
  const carlos = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(carlos, "carlos@ponte.dev");
  const fill = async (site: string) => {
    await carlos.goto("/dashboard");
    const form = carlos.locator("form").filter({ has: carlos.locator("input[name=starts_at]") });
    await form.locator("input[name=title]").fill(title);
    await form.locator("select[name=modality]").selectOption("online");
    await form.locator("input[name=starts_at]").fill(brt(24 * 60));
    await form.locator("input[name=ends_at]").fill(brt(25 * 60));
    await form.locator("input[name=online_url]").fill("meet.example.com/site");
    await form.locator("input[name=website_url]").fill(site);
    await form.getByRole("button", { name: "Publicar evento" }).click();
  };
  await fill("javascript:alert(1)");
  await expect(carlos.getByText("Site oficial do evento: informe um endereco valido")).toBeVisible();
  expect(await sql("main", "SELECT id FROM events WHERE title = ?", [title])).toHaveLength(0);
  await fill("https://lu.ma/e2e-site");
  await expect(carlos.getByText("Evento publicado e pronto para receber inscricoes.")).toBeVisible();
  const [row] = await sql<{ id: number; website_url: string }>("main", "SELECT id, website_url FROM events WHERE title = ?", [title]);
  expect(row.website_url).toBe("lu.ma/e2e-site");

  const visitor = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await visitor.goto(`/eventos/${row.id}`);
  const link = visitor.getByRole("link", { name: "Site oficial do evento" });
  await expect(link).toHaveAttribute("href", "https://lu.ma/e2e-site");
  await expect(link).toHaveAttribute("target", "_blank");

  await carlos.goto(`/meus-eventos/${row.id}/editar`);
  await expect(carlos.locator("input[name=website_url]")).toHaveValue("lu.ma/e2e-site");
  await carlos.locator("input[name=website_url]").fill("");
  await carlos.getByRole("button", { name: "Salvar alteracoes" }).click();
  await carlos.waitForLoadState("networkidle");
  await expect.poll(async () => (await sql<{ website_url: string }>("main", "SELECT website_url FROM events WHERE id = ?", [row.id]))[0].website_url).toBe("");
  await visitor.reload();
  await expect(visitor.getByRole("link", { name: "Site oficial do evento" })).toHaveCount(0);
});
