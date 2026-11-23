import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-rl-")), "test.db");
const { minutesLeft, blockedFor, recordAttempt, clearAttempts } = await import("../src/lib/rate-limit.ts");

const MIN = 60_000;

test("abaixo do limite nao bloqueia", () => {
  const now = 100 * MIN;
  assert.equal(minutesLeft([now - 1 * MIN, now - 2 * MIN, now - 3 * MIN, now - 4 * MIN], 5, 15, now), 0);
});

test("no limite bloqueia ate a tentativa mais antiga sair da janela", () => {
  const now = 100 * MIN;
  const times = [now - 10 * MIN, now - 4 * MIN, now - 3 * MIN, now - 2 * MIN, now - 1 * MIN];
  assert.equal(minutesLeft(times, 5, 15, now), 5);
  assert.equal(minutesLeft(times, 5, 15, now + 5 * MIN), 0);
});

test("tentativas fora da janela nao contam", () => {
  const now = 100 * MIN;
  assert.equal(minutesLeft([now - 20 * MIN, now - 16 * MIN, now - 3 * MIN, now - 2 * MIN, now - 1 * MIN], 5, 15, now), 0);
});

test("contagem no banco: bloqueia por assunto e libera ao limpar", async () => {
  const limit = { action: "login", subject: "email:a@b.com", max: 5, windowMin: 15 };
  for (let i = 0; i < 5; i++) await recordAttempt("login", [limit.subject, "ip:1.2.3.4"]);
  assert.ok((await blockedFor([limit])) > 0);
  assert.equal(await blockedFor([{ ...limit, subject: "email:outra@b.com" }]), 0);
  assert.equal(await blockedFor([{ action: "login", subject: "ip:1.2.3.4", max: 30, windowMin: 15 }]), 0);
  await clearAttempts("login", limit.subject);
  assert.equal(await blockedFor([limit]), 0);
});
