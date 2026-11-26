import { expect, test } from "@playwright/test";
import { ADMIN, adminLogin, MAIN, sql, totpCode } from "./helpers";

test("admin: dois fatores obrigatorios no primeiro acesso e codigo nos seguintes", async ({ browser }) => {
  const first = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await first.goto("/admin/login");
  await first.locator("#admin-user").fill(ADMIN.email);
  await first.locator("#admin-pass").fill(ADMIN.password);
  await first.locator("button[type=submit]").click();
  await first.waitForURL(/\/admin\/(login\/codigo|seguranca)/);
  await sql("main", "UPDATE admin_2fa SET disabled_at = ? WHERE disabled_at IS NULL", [new Date().toISOString()]);

  await first.goto("/admin/login");
  await first.locator("#admin-user").fill(ADMIN.email);
  await first.locator("#admin-pass").fill(ADMIN.password);
  await first.locator("button[type=submit]").click();
  await expect(first).toHaveURL(/\/admin\/seguranca$/);
  await expect(first.getByText("Os dois fatores sao obrigatorios")).toBeVisible();
  for (const path of ["/admin", "/admin/eventos", "/admin/projetos"]) {
    await first.goto(path);
    await expect(first).toHaveURL(/\/admin\/login$/);
  }
  await first.goto("/admin/seguranca");
  const secret = ((await first.locator("span.font-mono").first().textContent()) ?? "").replace(/\s/g, "");
  await first.locator("#code").fill("000000");
  await first.getByRole("button", { name: "Ativar" }).click();
  await expect(first.getByText("Codigo invalido")).toBeVisible();
  await first.goto("/admin/seguranca");
  await first.locator("#code").fill(await totpCode(secret));
  await first.getByRole("button", { name: "Ativar" }).click();
  const recovery = ((await first.locator("ul.font-mono li").first().textContent()) ?? "").trim();
  expect(recovery.length).toBeGreaterThan(0);
  await first.getByRole("button", { name: "Ja guardei os codigos" }).click();
  await expect(first.getByRole("button", { name: "Ja guardei os codigos" })).toBeHidden();
  await first.goto("/admin");
  await expect(first).toHaveURL(/\/admin$/);

  const next = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await next.goto("/admin/login");
  await next.locator("#admin-user").fill(ADMIN.email);
  await next.locator("#admin-pass").fill(ADMIN.password);
  await next.locator("button[type=submit]").click();
  await expect(next).toHaveURL(/\/admin\/login\/codigo$/);
  await next.goto("/admin");
  await expect(next).toHaveURL(/\/admin\/login$/);
  await next.goto("/admin/seguranca");
  await expect(next).toHaveURL(/\/admin\/login$/);
  await next.goto("/admin/login");
  await next.locator("#admin-user").fill(ADMIN.email);
  await next.locator("#admin-pass").fill(ADMIN.password);
  await next.locator("button[type=submit]").click();
  await next.locator("#admin-code").fill(recovery);
  await next.getByRole("button", { name: "Entrar" }).click();
  await expect(next).toHaveURL(/\/admin$/);

  const again = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await adminLogin(again);
});
