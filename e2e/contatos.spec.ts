import { expect, test } from "@playwright/test";
import { expectFitsMobile, MAIL, MAIN, sql, unique } from "./helpers";

async function contactMails(): Promise<Record<string, unknown>[]> {
  const mails = (await (await fetch(`${MAIL}/mails`)).json()) as Record<string, unknown>[];
  return mails.filter((m) => JSON.stringify(m.to).includes("pessoasepontes@gmail.com"));
}

test("pagina Contatos: menu, rodape, envio para o e-mail da Ponte, recusa e limite por hora", async ({ browser }) => {
  const page = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await page.goto("/eventos");
  await sql("main", "DELETE FROM auth_attempts WHERE action = 'contact_message'");
  const footer = page.getByRole("contentinfo");
  await expect(footer.getByRole("link", { name: "pessoasepontes@gmail.com" })).toHaveAttribute("href", "mailto:pessoasepontes@gmail.com");
  await expect(footer.getByRole("link", { name: "Instagram da Ponte" })).toHaveAttribute("href", "https://www.instagram.com/pessoasepontes/");
  await expect(footer.getByRole("link", { name: "LinkedIn da Ponte" })).toHaveAttribute("href", "https://www.linkedin.com/company/pessoas-e-pontes/");
  await page.getByRole("navigation", { name: "Rodape" }).getByRole("link", { name: "Contatos" }).click();
  await expect(page).toHaveURL(/\/contatos$/);
  await page.goto("/eventos");
  await page.getByRole("navigation", { name: "Principal" }).getByRole("link", { name: "Contatos" }).click();
  await expect(page).toHaveURL(/\/contatos$/);
  await expect(page.getByRole("heading", { level: 1, name: "Fale com a gente" })).toBeVisible();
  const channels = page.getByRole("list", { name: "Nossos contatos" });
  await expect(channels.getByRole("link", { name: /Instagram/ })).toHaveAttribute("target", "_blank");
  await expect(channels.getByRole("link", { name: /LinkedIn/ })).toHaveAttribute("href", "https://www.linkedin.com/company/pessoas-e-pontes/");

  const before = (await contactMails()).length;
  const name = unique("Visitante");
  const fill = async (text: string) => {
    await page.getByLabel("Nome").fill(name);
    await page.getByLabel("E-mail").fill("visitante@e2e.test");
    await page.getByLabel("Tipo").selectOption("Elogio");
    await page.getByLabel("Descrição").fill(text);
  };

  await fill("   ");
  await page.getByLabel("Descrição").evaluate((el: HTMLTextAreaElement) => el.removeAttribute("required"));
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("form").getByRole("alert")).toHaveText("Escreva a descrição.");
  await expect(page.getByLabel("Nome")).toHaveValue(name);
  await expect(page.getByLabel("Tipo")).toHaveValue("Elogio");

  await page.getByLabel("Descrição").fill("Adorei a plataforma!\nParabens.");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("form").getByRole("status")).toContainText("Mensagem enviada");
  await expect.poll(async () => (await contactMails()).length).toBe(before + 1);
  const mail = (await contactMails()).at(-1)!;
  expect(mail.subject).toBe(`[Contato] Elogio — ${name}`);
  expect(mail.reply_to).toBe("visitante@e2e.test");
  expect(String(mail.text)).toContain("Adorei a plataforma!");

  for (let i = 2; i <= 5; i++) {
    await page.goto("/contatos");
    await fill(`Mensagem ${i}`);
    await page.getByRole("button", { name: "Enviar mensagem" }).click();
    await expect(page.locator("form").getByRole("status")).toContainText("Mensagem enviada");
  }
  await page.goto("/contatos");
  await fill("Mensagem 6");
  await page.getByRole("button", { name: "Enviar mensagem" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText("Muitas mensagens em pouco tempo");
  await expect(page.getByLabel("Descrição")).toHaveValue("Mensagem 6");
  await expect.poll(async () => (await contactMails()).length).toBe(before + 5);
  await sql("main", "DELETE FROM auth_attempts WHERE action = 'contact_message'");

  await expectFitsMobile(page, "/contatos");
  await expectFitsMobile(page, "/eventos");
});
