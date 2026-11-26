import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.DATABASE_URL) process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-as-")), "test.db");
process.env.ADMIN_PASSWORD = "senha-admin-teste";
const { openAdminSession, checkAdminSession, closeAdminSession, closeAllAdminSessions } = await import("../src/lib/admin-sessions.ts");
const { getDb } = await import("../src/lib/db.ts");

const MIN = 60 * 1000;
const T0 = 1_800_000_000_000;

test("sessao do admin: sair encerra no servidor e o mesmo cookie deixa de valer", async () => {
  const token = await openAdminSession(T0);
  assert.equal(await checkAdminSession(token, T0 + MIN), true);
  const row = await getDb().prepare("SELECT token_hash FROM admin_sessions").get();
  assert.notEqual(row.token_hash, token);
  await closeAdminSession(token);
  assert.equal(await checkAdminSession(token, T0 + 2 * MIN), false);
  assert.equal(await checkAdminSession("outro-token", T0), false);
  assert.equal(await checkAdminSession(undefined, T0), false);
});

test("sessao do admin: cai depois de 1 hora sem uso, renova com uso e dura no maximo 8 horas", async () => {
  const parada = await openAdminSession(T0);
  assert.equal(await checkAdminSession(parada, T0 + 59 * MIN), true);
  assert.equal(await checkAdminSession(parada, T0 + 59 * MIN + 61 * MIN), false);

  const ativa = await openAdminSession(T0);
  for (let t = 50; t < 8 * 60; t += 50) assert.equal(await checkAdminSession(ativa, T0 + t * MIN), true, `minuto ${t}`);
  assert.equal(await checkAdminSession(ativa, T0 + 8 * 60 * MIN), false);
});

test("sessao do admin: sair de todos os aparelhos e trocar ADMIN_PASSWORD derrubam todas", async () => {
  await closeAllAdminSessions();
  const a = await openAdminSession(T0);
  const b = await openAdminSession(T0);
  assert.equal(await closeAllAdminSessions(), 2);
  assert.equal(await checkAdminSession(a, T0 + MIN), false);
  assert.equal(await checkAdminSession(b, T0 + MIN), false);

  const c = await openAdminSession(T0);
  process.env.ADMIN_PASSWORD = "senha-nova";
  assert.equal(await checkAdminSession(c, T0 + MIN), false);
  process.env.ADMIN_PASSWORD = "senha-admin-teste";
  assert.equal(await checkAdminSession(c, T0 + MIN), true);
});
