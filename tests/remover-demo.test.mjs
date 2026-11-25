import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "pg";

// Banco proprio deste arquivo: a remocao nao pode afetar os outros testes.
const adminUrl = process.env.DATABASE_URL;
const pgName = `ponte_demo_${process.pid}`;
let target;
if (adminUrl) {
  const u = new URL(adminUrl);
  u.pathname = `/${pgName}`;
  target = { url: u.toString() };
  process.env.DATABASE_URL = target.url;
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-demo-"));
  process.env.DATABASE_PATH = path.join(dir, "test.db");
  target = { file: process.env.DATABASE_PATH };
}

let db, demo;
const q = (sql) => db.getDb().prepare(sql);
before(async () => {
  if (adminUrl) {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    await c.query(`CREATE DATABASE ${pgName}`);
    await c.end();
  }
  db = await import("../src/lib/db.ts");
  demo = await import("../scripts/remover-demo.mjs");
  await q("SELECT 1").get();
});

const idOf = async (email) => (await q("SELECT id FROM users WHERE email = ?").get(email))?.id;
async function run(fn) {
  const conn = await demo.openDb(target);
  try {
    return await fn(conn);
  } finally {
    await conn.close();
  }
}

test("so remove as contas de demonstracao; para se houver ligacao com pessoa real", async () => {
  await q("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)").run("real1@exemplo.com", "x", "Pessoa Real 1", "mentee");
  await q("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)").run("real2@exemplo.com", "x", "Pessoa Real 2", "mentee");
  const real1 = await idOf("real1@exemplo.com");
  const real2 = await idOf("real2@exemplo.com");
  const ana = await idOf("ana@ponte.dev");
  const joao = await idOf("joao@email.com");
  await q("INSERT INTO projects (owner_id, kind, title) VALUES (?,?,?)").run(real1, "particular", "Projeto real");
  await q("INSERT INTO conversations (user_a, user_b) VALUES (?,?)").run(ana, joao);
  await q("INSERT INTO audit_log (actor_id, action, entity_type) VALUES (?,?,?)").run(ana, "teste", "user");
  await q("INSERT INTO mentorships (mentor_id, mentee_id, status) VALUES (?,?,?)").run(ana, real2, "active");

  const before = await run(async (c) => { await c.begin(true); const s = await demo.survey(c); await c.rollback(); return s; });
  assert.equal(before.found, 7);
  assert.deepEqual(before.links, { mentorships: 1 });
  assert.equal(before.removed.users, 7);
  assert.equal(before.removed.conversations, 1);

  await assert.rejects(run((c) => demo.remove(c)), /ligacao/);
  assert.equal((await q("SELECT COUNT(*) AS n FROM users").get()).n, 9);

  await q("DELETE FROM mentorships WHERE mentee_id = ?").run(real2);
  const done = await run((c) => demo.remove(c));
  assert.equal(done.found, 7);

  const emails = (await q("SELECT email FROM users ORDER BY email").all()).map((r) => r.email);
  assert.deepEqual(emails, ["real1@exemplo.com", "real2@exemplo.com"]);
  assert.equal((await q("SELECT COUNT(*) AS n FROM projects").get()).n, 1);
  assert.equal((await q("SELECT title FROM projects").get()).title, "Projeto real");
  assert.equal((await q("SELECT COUNT(*) AS n FROM conversations").get()).n, 0);
  for (const t of ["events", "opportunities", "contributions", "endorsements", "profiles", "mentorships"])
    assert.equal(Number((await q(`SELECT COUNT(*) AS n FROM ${t}`).get()).n), 0, t);
  const audit = await q("SELECT actor_id FROM audit_log WHERE action = 'teste'").get();
  assert.equal(audit.actor_id, null);

  const again = await run(async (c) => { await c.begin(true); const s = await demo.survey(c); await c.rollback(); return s; });
  assert.equal(again.found, 0);
  assert.deepEqual(again.removed, {});
});
