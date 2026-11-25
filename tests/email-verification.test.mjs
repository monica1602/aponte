import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-ev-")), "test.db");
const { getDb } = await import("../src/lib/db.ts");
const { adminConfirmEmail, createVerificationToken, markVerificationUsed, verificationTarget, VERIFY_TTL_MS } = await import("../src/lib/email-verification.ts");

async function newUser(email, status = "pending") {
  const r = await getDb()
    .prepare("INSERT INTO users (email, password_hash, name, role, email_status) VALUES (?,?,?,?,?)")
    .run(email, "x", "Pessoa Teste", "mentee", status);
  return Number(r.lastInsertRowid);
}

test("contas antigas e novas sem informar ficam como e-mail confirmado", async () => {
  const r = await getDb().prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)").run(`antiga${Date.now()}@t.com`, "x", "Antiga", "mentor");
  const u = await getDb().prepare("SELECT email_status FROM users WHERE id = ?").get(Number(r.lastInsertRowid));
  assert.equal(u.email_status, "verified");
});

test("link valido, vencido, reusado e invalido", async () => {
  const id = await newUser(`nova${Date.now()}@t.com`);
  const token = await createVerificationToken(id);
  const t = await verificationTarget(token);
  assert.equal(t.user_id, id);
  assert.equal(t.expired, false);
  assert.equal((await verificationTarget(token, Date.now() + VERIFY_TTL_MS + 1000)).expired, true);
  assert.equal(await verificationTarget("a".repeat(64)), null);
  assert.equal(await verificationTarget("nao-e-token"), null);
  await markVerificationUsed(token);
  assert.equal(await verificationTarget(token), null);
});

test("novo link substitui o anterior e conta confirmada nao aceita link", async () => {
  const id = await newUser(`troca${Date.now()}@t.com`);
  const first = await createVerificationToken(id);
  const second = await createVerificationToken(id);
  assert.equal(await verificationTarget(first), null);
  assert.ok(await verificationTarget(second));
  await getDb().prepare("UPDATE users SET email_status = 'verified' WHERE id = ?").run(id);
  assert.equal(await verificationTarget(second), null);
});

test("admin confirma e-mail pendente, o link antigo para de valer e contestado nao muda", async () => {
  const id = await newUser(`admin${Date.now()}@t.com`);
  const token = await createVerificationToken(id);
  assert.equal(await adminConfirmEmail(id), true);
  const u = await getDb().prepare("SELECT email_status, email_verified_at FROM users WHERE id = ?").get(id);
  assert.equal(u.email_status, "verified");
  assert.ok(u.email_verified_at);
  assert.equal(await verificationTarget(token), null);
  assert.equal(await adminConfirmEmail(id), false);
  const disputed = await newUser(`contestado${Date.now()}@t.com`, "disputed");
  assert.equal(await adminConfirmEmail(disputed), false);
  assert.equal((await getDb().prepare("SELECT email_status FROM users WHERE id = ?").get(disputed)).email_status, "disputed");
});
