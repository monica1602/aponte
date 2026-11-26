import { expect, test } from "@playwright/test";
import { brt, login, MAIN, sql, unique } from "./helpers";

test("eventos pagos: valor validado, aprovacao obrigatoria e pagamento so para quem pediu inscricao", async ({ browser }) => {
  const title = unique("Evento pago");
  const carlos = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(carlos, "carlos@ponte.dev");
  const create = async (price: string) => {
    await carlos.goto("/dashboard");
    const form = carlos.locator("form").filter({ has: carlos.locator("input[name=starts_at]") });
    await form.locator("input[name=title]").fill(title);
    await form.locator("select[name=modality]").selectOption("online");
    await form.locator("input[name=starts_at]").fill(brt(24 * 60));
    await form.locator("input[name=ends_at]").fill(brt(25 * 60));
    await form.locator("input[name=online_url]").fill("meet.example.com/pago");
    await expect(form.locator("input[name=price]")).toBeHidden();
    await form.getByText("Pago", { exact: true }).click();
    await form.locator("input[name=price]").fill(price);
    await form.locator("input[name=payment_url]").fill("sympla.com.br/e2e-pago");
    await form.locator("textarea[name=payment_info]").fill("Pix para a chave e2e@pix.dev");
    await form.getByRole("button", { name: "Publicar evento" }).click();
  };
  await create("abc");
  await expect(carlos.getByText("Valor do evento: informe um valor entre R$ 1,00 e R$ 5.000,00")).toBeVisible();
  await create("50,00");
  await expect(carlos.getByText("Evento publicado e pronto para receber inscricoes.")).toBeVisible();
  const [ev] = await sql<{ id: number; price_cents: number; require_approval: number }>("main", "SELECT id, price_cents, require_approval FROM events WHERE title = ?", [title]);
  expect(Number(ev.price_cents)).toBe(5000);
  expect(Number(ev.require_approval)).toBe(1);

  const visitor = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await visitor.goto(`/eventos/${ev.id}`);
  await expect(visitor.getByText("R$ 50,00")).toBeVisible();
  await expect(visitor.getByText("A Ponte nao recebe nem devolve valores.")).toBeVisible();
  await expect(visitor.getByText("Pix para a chave e2e@pix.dev")).toHaveCount(0);
  await visitor.goto("/eventos");
  await expect(visitor.locator("div").filter({ hasText: title }).getByText("R$ 50,00").first()).toBeVisible();

  const maria = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await login(maria, "maria@email.com");
  await maria.goto(`/eventos/${ev.id}`);
  await expect(maria.getByText("Pix para a chave e2e@pix.dev")).toHaveCount(0);
  await maria.locator("input[name=lgpd]").check();
  await maria.locator("input[name=paid_ack]").check();
  await maria.getByRole("button", { name: "Solicitar inscricao" }).click();
  await expect(maria.getByText("Solicitacao enviada. Faca o pagamento")).toBeVisible();
  await expect(maria.getByText("Pix para a chave e2e@pix.dev")).toBeVisible();
  await expect(maria.getByRole("link", { name: "Pagar no site do organizador" })).toHaveAttribute("href", "https://sympla.com.br/e2e-pago");
  const [reg] = await sql<{ status: string }>("main", "SELECT r.status FROM event_registrations r JOIN users u ON u.id = r.user_id WHERE r.event_id = ? AND u.email = ?", [ev.id, "maria@email.com"]);
  expect(reg.status).toBe("requested");

  await carlos.goto(`/meus-eventos/${ev.id}/editar`);
  await expect(carlos.locator("input[name=price]")).toHaveValue("50,00");
  await carlos.getByText("Gratuito", { exact: true }).click();
  await carlos.getByRole("button", { name: "Salvar alteracoes" }).click();
  await expect.poll(async () => Number((await sql<{ price_cents: number }>("main", "SELECT price_cents FROM events WHERE id = ?", [ev.id]))[0].price_cents)).toBe(0);
  await visitor.goto(`/eventos/${ev.id}`);
  await expect(visitor.getByText("Gratuito", { exact: true })).toBeVisible();
});
