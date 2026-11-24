import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-my-data-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, my;
before(async () => {
  db = await import("../src/lib/db.ts");
  my = await import("../src/lib/my-data.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const id = async (email) => (await db.getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)).id;

test("o arquivo traz os dados da pessoa, sem senha, e nao traz dados de outra conta", async () => {
  const joao = await id("joao@email.com");
  const data = await my.collectMyData(joao);
  assert.equal(data.conta.email, "joao@email.com");
  assert.equal("password_hash" in data.conta, false);
  const text = JSON.stringify(data);
  assert.ok(!text.includes("maria@email.com"));
  for (const k of Object.keys(my.MY_DATA_SECTIONS)) assert.ok(k in data, `faltou ${k}`);
});

test("troca de e-mail: link de uso unico, com prazo, so do pedido mais recente", async () => {
  const maria = await id("maria@email.com");
  const old = await my.createEmailChange(maria, "velho@exemplo.com");
  const token = await my.createEmailChange(maria, "nova@exemplo.com");
  assert.equal(await my.emailChangeTarget(old), null);
  const t = await my.emailChangeTarget(token);
  assert.equal(t.new_email, "nova@exemplo.com");
  assert.equal(t.old_email, "maria@email.com");
  assert.equal(t.expired, false);
  assert.equal((await my.emailChangeTarget(token, Date.now() + my.EMAIL_CHANGE_TTL_MS + 1)).expired, true);
  assert.equal(await my.pendingEmailChange(maria), "nova@exemplo.com");
  await my.markEmailChangeUsed(token);
  assert.equal(await my.emailChangeTarget(token), null);
  assert.equal(await my.pendingEmailChange(maria), null);
  assert.equal(await my.emailChangeTarget("nao-e-um-token"), null);
});

test("prazo do pedido e de 15 dias", () => {
  assert.equal(my.requestDeadline("2026-11-23 23:10:00"), "2026-12-08");
});
