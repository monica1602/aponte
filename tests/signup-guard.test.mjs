import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.DATABASE_URL) process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-sg-")), "test.db");
const { looksLikeBot, signupAlertText, SIGNUP_SITE_LIMIT, SIGNUP_TRAP_FIELD, SIGNUP_STARTED_FIELD } = await import("../src/lib/signup-guard.ts");
const { blockedFor, recordAttempt } = await import("../src/lib/rate-limit.ts");
const { getDb } = await import("../src/lib/db.ts");

const MIN = 60_000;
const form = (fields) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

test("pessoa que preencheu em mais de 3 segundos passa", () => {
  const now = 1_000_000;
  assert.equal(looksLikeBot(form({ [SIGNUP_STARTED_FIELD]: String(now - 5000), [SIGNUP_TRAP_FIELD]: "" }), now), false);
});

test("robo: campo escondido preenchido, sem horario ou rapido demais", () => {
  const now = 1_000_000;
  assert.equal(looksLikeBot(form({ [SIGNUP_STARTED_FIELD]: String(now - 5000), [SIGNUP_TRAP_FIELD]: "x" }), now), true);
  assert.equal(looksLikeBot(form({}), now), true);
  assert.equal(looksLikeBot(form({ [SIGNUP_STARTED_FIELD]: "abc" }), now), true);
  assert.equal(looksLikeBot(form({ [SIGNUP_STARTED_FIELD]: String(now - 1000) }), now), true);
});

test("limite do site: o 31o cadastro na mesma hora e bloqueado", async () => {
  await getDb().prepare("DELETE FROM auth_attempts WHERE action IN ('signup', 'signup_alert')").run();
  for (let i = 0; i < 30; i++) {
    assert.equal(await blockedFor([SIGNUP_SITE_LIMIT]), 0);
    await recordAttempt("signup", [`ip:10.0.0.${i}`, SIGNUP_SITE_LIMIT.subject]);
  }
  assert.ok((await blockedFor([SIGNUP_SITE_LIMIT])) > 0);
  assert.equal(await blockedFor([{ action: "signup", subject: "ip:10.0.0.1", max: 20, windowMin: 60 }]), 0);
});

test("aviso ao admin: no maximo 1 por hora, contando os cadastros sem aviso", async () => {
  const db = getDb();
  await db.prepare("DELETE FROM auth_attempts WHERE action IN ('signup', 'signup_alert')").run();
  const signupAt = (t) => db.prepare("INSERT INTO auth_attempts (action, subject, attempted_at) VALUES ('signup', 'site', ?)").run(t);
  const t0 = Date.now() - 3 * 60 * MIN;
  await signupAt(t0);
  assert.equal(await signupAlertText("Novo cadastro de mentorado: Ana", t0), "Novo cadastro de mentorado: Ana");
  await signupAt(t0 + 10 * MIN);
  assert.equal(await signupAlertText("Novo cadastro de mentor: Bia", t0 + 10 * MIN), null);
  await signupAt(t0 + 50 * MIN);
  assert.equal(await signupAlertText("Novo cadastro de mentor: Caio", t0 + 50 * MIN), null);
  await signupAt(t0 + 61 * MIN);
  assert.equal(await signupAlertText("Novo cadastro de empresa: Duda", t0 + 61 * MIN), "Novo cadastro de empresa: Duda (e mais 2 cadastros desde o ultimo aviso)");
  await signupAt(t0 + 62 * MIN);
  assert.equal(await signupAlertText("Novo cadastro de mentor: Edu", t0 + 62 * MIN), null);
});
