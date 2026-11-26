import { expect, test } from "@playwright/test";
import { adminLogin, MAIN, sql } from "./helpers";

test("admin: sair encerra a sessao no servidor, sair de todos derruba os outros aparelhos e 1 hora parada expira", async ({ browser }) => {
  test.setTimeout(240_000);
  const a = await browser.newContext({ baseURL: MAIN });
  const pa = await a.newPage();
  await adminLogin(pa);
  const copied = (await a.cookies()).find((c) => c.name === "ponte_admin");
  expect(copied).toBeTruthy();
  await pa.getByRole("button", { name: "Sair do admin" }).click();
  await expect(pa).toHaveURL(/\/admin\/login$/);
  const thief = await browser.newContext({ baseURL: MAIN });
  await thief.addCookies([copied!]);
  const pt = await thief.newPage();
  await pt.goto("/admin");
  await expect(pt).toHaveURL(/\/admin\/login$/);

  await adminLogin(pa);
  const b = await browser.newContext({ baseURL: MAIN });
  const pb = await b.newPage();
  await adminLogin(pb);
  await pa.goto("/admin/seguranca");
  await pa.getByRole("button", { name: "Sair de todos os aparelhos" }).click();
  await expect(pa.getByText("Todas as sessoes da administracao foram encerradas")).toBeVisible();
  await pb.goto("/admin");
  await expect(pb).toHaveURL(/\/admin\/login$/);

  await adminLogin(pb);
  await sql("main", "UPDATE admin_sessions SET idle_expires_at = ?", [Date.now() - 1000]);
  await pb.goto("/admin");
  await expect(pb).toHaveURL(/\/admin\/login$/);
});
