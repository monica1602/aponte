import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Producao do Vercel nunca cria dados de demonstracao, mesmo sem SEED_DEMO=0.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-seed-prod-"));
delete process.env.DATABASE_URL;
delete process.env.SEED_DEMO;
process.env.DATABASE_PATH = path.join(dir, "test.db");
process.env.VERCEL_ENV = "production";

test("banco vazio na producao fica sem contas de demonstracao", async () => {
  const { getDb } = await import("../src/lib/db.ts");
  const { n } = await getDb().prepare("SELECT COUNT(*) AS n FROM users").get();
  assert.equal(Number(n), 0);
  const p = await getDb().prepare("SELECT COUNT(*) AS n FROM profiles").get();
  assert.equal(Number(p.n), 0);
});
