import { expect, test } from "@playwright/test";
import { adminLogin, MAIN, signup, sql, unique } from "./helpers";

test("admin exclui conta pendente e projeto com conferencia e motivo", async ({ browser }) => {
  const name = unique("Duplicado E2E");
  const email = `${name.replace(/\W+/g, "").toLowerCase()}@e2e.test`;
  const person = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await signup(person, { name, email, password: "Senha@forte2026" });
  await expect(person).toHaveURL(/\/perfil/);
  const [row] = await sql<{ id: number }>("main", "SELECT id FROM users WHERE email = ?", [email]);
  const id = Number(row.id);

  const stranger = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await stranger.goto(`/admin/excluir/conta/${id}`);
  await expect(stranger).toHaveURL(/\/admin\/login/);

  const admin = await (await browser.newContext({ baseURL: MAIN })).newPage();
  await adminLogin(admin);

  await admin.goto(`/admin/usuarios/${id}`);
  await admin.getByRole("link", { name: "Excluir conta" }).click();
  await expect(admin.getByText("e-mail nao confirmado")).toBeVisible();
  await admin.locator("input[name=reason]").fill("cadastro duplicado");
  await admin.locator("input[name=confirm]").check();
  await admin.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(admin).toHaveURL(/\/admin\/mentorados/);
  await expect(admin.getByText(`Conta "${name}" excluido(a) definitivamente. Motivo registrado.`)).toBeVisible();
  expect(await sql("main", "SELECT id FROM users WHERE id = ?", [id])).toHaveLength(0);

  const title = unique("Projeto teste E2E");
  await sql("main", "INSERT INTO projects (owner_id, kind, title, description) SELECT id, 'educacional', ?, 'teste' FROM users WHERE email = ?", [title, "maria@email.com"]);
  await admin.goto("/admin/projetos");
  await admin.locator("tr").filter({ hasText: title }).getByRole("link", { name: "Excluir" }).click();
  await admin.locator("input[name=reason]").fill("projeto de teste");
  await admin.locator("input[name=confirm]").check();
  await admin.getByRole("button", { name: "Excluir definitivamente" }).click();
  await expect(admin).toHaveURL(/\/admin\/projetos/);
  await expect(admin.getByText(`Projeto "${title}" excluido(a) definitivamente. Motivo registrado.`)).toBeVisible();
  await expect(admin.getByText("Motivo: projeto de teste")).toBeVisible();
  expect(await sql("main", "SELECT id FROM projects WHERE title = ?", [title])).toHaveLength(0);
});
