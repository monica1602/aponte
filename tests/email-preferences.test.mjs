import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-email-prefs-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, mail;
before(async () => {
  db = await import("../src/lib/db.ts");
  mail = await import("../src/lib/email-prefs.ts");
  await db.getDb().prepare("SELECT 1").get();
});

test("contas comecam com avisos e lembretes ligados e novidades desligadas", async () => {
  const u = await db.getDb().prepare("SELECT id, email_network, email_reminders, news_consent FROM users WHERE email = 'joao@email.com'").get();
  assert.deepEqual([u.email_network, u.email_reminders, u.news_consent].map(Number), [1, 1, 0]);
  assert.equal(await mail.wantsEmail(u.id, "network"), true);
  assert.equal(await mail.wantsEmail(u.id, "reminders"), true);
});

test("preferencia desligada bloqueia o tipo; essenciais sempre saem", async () => {
  const { id } = await db.getDb().prepare("SELECT id FROM users WHERE email = 'maria@email.com'").get();
  await db.getDb().prepare("UPDATE users SET email_network = 0, email_reminders = 0 WHERE id = ?").run(id);
  assert.equal(await mail.wantsEmail(id, "network"), false);
  assert.equal(await mail.wantsEmail(id, "reminders"), false);
  assert.equal(await mail.wantsEmail(id, "essential"), true);
});

test("link Gerenciar e-mails leva a Meus dados depois do login", () => {
  assert.equal(mail.MANAGE_EMAILS_PATH, "/login?next=%2Fmeus-dados%23comunicacoes");
});
