import { expect, test, type Browser, type Page } from "@playwright/test";
import { adminLogin, brt, login, MAIN, sql, unique } from "./helpers";

test.describe.configure({ mode: "serial" });

async function as(browser: Browser, email: string): Promise<Page> {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(page, email);
  return page;
}

test("eventos de mentorados: criar, convidar, aprovacao do admin e inscricao do convidado", async ({ browser }) => {
  const title = unique("Grupo de estudo E2E");
  const maria = await as(browser, "maria@email.com");
  const form = maria.locator("form").filter({ has: maria.locator("input[name=starts_at]") });
  await form.locator("input[name=title]").fill(title);
  await form.locator("select[name=category]").selectOption("Grupo de estudo");
  await form.locator("input[name=starts_at]").fill(brt(60));
  await form.locator("input[name=ends_at]").fill(brt(120));
  await form.locator("input[name=online_url]").fill("https://meet.example.com/grupo");
  await form.getByRole("button", { name: "Enviar para aprovacao" }).click();
  await expect(maria.getByText("Este evento aguarda a aprovacao da administracao.")).toBeVisible();
  const eventId = Number(maria.url().match(/eventos\/(\d+)/)?.[1]);
  expect(eventId).toBeGreaterThan(0);

  await maria.locator("input[name=q]").fill("Carlos");
  await maria.getByRole("button", { name: "Buscar" }).click();
  await expect(maria.getByText("carlos@ponte.dev")).toHaveCount(0);
  await maria.locator("li").filter({ hasText: "Carlos Lima" }).getByRole("button", { name: "Convidar" }).click();
  await expect(maria.getByText("sai quando o evento for aprovado")).toBeVisible();

  const carlos = await as(browser, "carlos@ponte.dev");
  expect((await carlos.goto(`/eventos/${eventId}`))?.status()).toBe(404);
  await carlos.goto("/eventos");
  await expect(carlos.getByText(title)).toHaveCount(0);

  const admin = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await adminLogin(admin);
  await admin.goto("/admin/eventos");
  const card = admin.locator("li").filter({ hasText: title });
  await expect(card.getByText("Convidados: Carlos Lima")).toBeVisible();
  await card.getByRole("button", { name: "Aprovar" }).click();
  await expect(admin.getByText(`Evento "${title}" aprovado. 1 convite(s) enviado(s).`)).toBeVisible();

  await carlos.goto("/eventos");
  await expect(carlos.getByText(title)).toBeVisible();
  const note = await sql<{ n: number }>("main", "SELECT COUNT(*) AS n FROM notifications n JOIN users u ON u.id = n.user_id WHERE u.email = ? AND n.link = ?", ["carlos@ponte.dev", `/eventos/${eventId}`]);
  expect(Number(note[0].n)).toBe(1);
  await carlos.goto(`/eventos/${eventId}`);
  await expect(carlos.getByText("Maria Clara convidou voce para este evento.")).toBeVisible();
  const request = carlos.locator("form").filter({ has: carlos.locator("input[name=lgpd]") });
  await request.locator("input[name=lgpd]").check();
  await request.locator("button[type=submit], button").last().click();
  await carlos.waitForLoadState("networkidle");
  const reg = await sql<{ status: string }>("main", "SELECT r.status FROM event_registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND u.email = ?", [eventId, "carlos@ponte.dev"]);
  expect(reg[0]?.status).toBe("approved");

  await maria.goto("/meus-eventos");
  await expect(maria.locator("li").filter({ hasText: title }).getByText("Carlos Lima").first()).toBeVisible();
});

test("eventos de mentorados: recusa com motivo", async ({ browser }) => {
  const title = unique("Roda E2E");
  const maria = await as(browser, "maria@email.com");
  const form = maria.locator("form").filter({ has: maria.locator("input[name=starts_at]") });
  await form.locator("input[name=title]").fill(title);
  await form.locator("select[name=category]").selectOption("Roda de conversa");
  await form.locator("input[name=starts_at]").fill(brt(60));
  await form.locator("input[name=ends_at]").fill(brt(120));
  await form.locator("input[name=online_url]").fill("https://meet.example.com/roda");
  await form.getByRole("button", { name: "Enviar para aprovacao" }).click();
  await expect(maria.getByText("Este evento aguarda a aprovacao da administracao.")).toBeVisible();

  const admin = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await adminLogin(admin);
  await admin.goto("/admin/eventos");
  const card = admin.locator("li").filter({ hasText: title });
  await card.locator("input[name=reason]").fill("Faltou a descricao");
  await card.getByRole("button", { name: "Recusar" }).click();
  await expect(admin.getByText(`Evento "${title}" recusado. A pessoa foi avisada.`)).toBeVisible();

  await maria.reload();
  await expect(maria.getByText("A administracao recusou este evento. Motivo: Faltou a descricao")).toBeVisible();
});
