import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.DATABASE_URL) process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-lg-")), "test.db");
const { loginLimits, secondsToWait, progressiveWait, clearLoginAttempts, claimOwnerWarning } = await import("../src/lib/login-guard.ts");
const { blockedFor, recordAttempt } = await import("../src/lib/rate-limit.ts");
const { getDb } = await import("../src/lib/db.ts");

const S = 1000;
const fail = (email, ip) => {
  const l = loginLimits(email, ip);
  return recordAttempt("login", [l.pair.subject, l.email.subject, l.ip.subject]);
};

test("espera crescente: 2, 4, 8 e 16 segundos depois de cada erro", () => {
  const now = 10_000 * S;
  assert.equal(secondsToWait([], now), 0);
  assert.equal(secondsToWait([now - 1 * S], now), 1);
  assert.equal(secondsToWait([now - 3 * S], now), 0);
  assert.equal(secondsToWait([now - 10 * S, now - 1 * S], now), 3);
  assert.equal(secondsToWait([now - 30 * S, now - 20 * S, now - 1 * S], now), 7);
  assert.equal(secondsToWait([now - 40 * S, now - 30 * S, now - 20 * S, now - 1 * S], now), 15);
  assert.equal(secondsToWait([now - 16 * 60 * S], now), 0);
});

test("5 erros de um IP nao bloqueiam o mesmo e-mail em outro IP", async () => {
  await getDb().prepare("DELETE FROM auth_attempts").run();
  for (let i = 0; i < 5; i++) await fail("ana@x.com", "1.1.1.1");
  const atacante = loginLimits("ana@x.com", "1.1.1.1");
  const dona = loginLimits("ana@x.com", "2.2.2.2");
  assert.ok((await blockedFor([atacante.pair, atacante.email, atacante.ip])) > 0);
  assert.equal(await blockedFor([dona.pair, dona.email, dona.ip]), 0);
  assert.equal(await progressiveWait(dona.pair), 0);
});

test("o 31o erro na mesma hora, de varios IPs, bloqueia o e-mail; redefinir a senha libera", async () => {
  await getDb().prepare("DELETE FROM auth_attempts").run();
  for (let i = 0; i < 30; i++) await fail("bia@x.com", `10.0.0.${i}`);
  const nova = loginLimits("bia@x.com", "9.9.9.9");
  assert.ok((await blockedFor([nova.pair, nova.email, nova.ip])) > 0);
  assert.equal(await blockedFor([loginLimits("outra@x.com", "9.9.9.9").email]), 0);
  await clearLoginAttempts("bia@x.com");
  assert.equal(await blockedFor([nova.pair, nova.email, nova.ip]), 0);
  assert.equal(await blockedFor([loginLimits("bia@x.com", "10.0.0.1").pair]), 0);
});

test("aviso ao dono no maximo 1 vez a cada 24 horas", async () => {
  await getDb().prepare("DELETE FROM auth_attempts").run();
  const now = Date.now();
  assert.equal(await claimOwnerWarning("caio@x.com", now), true);
  assert.equal(await claimOwnerWarning("caio@x.com", now + 60 * 60 * S), false);
  assert.equal(await claimOwnerWarning("duda@x.com", now), true);
  assert.equal(await claimOwnerWarning("caio@x.com", now + 25 * 60 * 60 * S), true);
});
