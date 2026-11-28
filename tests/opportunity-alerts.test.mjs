import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-opp-alerts-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, alerts;
before(async () => {
  db = await import("../src/lib/db.ts");
  alerts = await import("../src/lib/opportunity-alerts.ts");
  await db.getDb().prepare("SELECT 1").get();
});

let seq = 0;
async function newUser(role, tools, extra = "") {
  seq++;
  const r = await db.getDb().prepare(
    "INSERT INTO users (email, password_hash, name, role, public_profile_consent) VALUES (?,?,?,?,1)"
  ).run(`opp-${seq}-${extra}@x.test`, "x", `Pessoa ${seq}`, role);
  const id = Number(r.lastInsertRowid);
  if (tools) await db.getDb().prepare("INSERT INTO profiles (user_id, data) VALUES (?,?)").run(id, JSON.stringify({ tools }));
  return id;
}
let oppSeq = 1000;
const publish = (ownerId, skills, now) => alerts.alertMatchingMentees({ id: ++oppSeq, ownerId, title: `Vaga ${oppSeq}`, skills }, now);

test("so mentorados ativos com skill em comum, sem quem publicou nem bloqueios", async () => {
  const owner = await newUser("mentor", ["Elixir"]);
  const a = await newUser("mentee", ["Elixir", "Rust"]);
  const b = await newUser("mentee", ["Elixir"]);
  const blocked = await newUser("mentee", ["Elixir"]);
  const blocker = await newUser("mentee", ["Elixir"]);
  const inactive = await newUser("mentee", ["Elixir"]);
  const other = await newUser("mentee", ["Go"]);
  const mentor = await newUser("mentor", ["Elixir"]);
  await db.getDb().prepare("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)").run(owner, blocked);
  await db.getDb().prepare("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)").run(blocker, owner);
  await db.getDb().prepare("UPDATE users SET account_status = 'blocked' WHERE id = ?").run(inactive);

  const r = await publish(owner, " elíxir , RUST,  ");
  assert.deepEqual(r.notified, [a, b]);
  for (const id of [blocked, blocker, inactive, other, mentor, owner]) assert.ok(!r.notified.includes(id));
  const n = await db.getDb().prepare("SELECT body, link FROM notifications WHERE user_id = ?").get(a);
  assert.equal(n.body, `Nova oportunidade compativel: Vaga ${oppSeq} (Elixir, Rust)`);
  assert.equal(n.link, `/oportunidades#oportunidade-${oppSeq}`);
});

test("no maximo 50 avisados, primeiro quem tem mais skills em comum", async () => {
  const owner = await newUser("company");
  for (let i = 0; i < 55; i++) await newUser("mentee", ["Haskell"]);
  const best = await newUser("mentee", ["Haskell", "OCaml"]);
  const r = await publish(owner, "Haskell, OCaml");
  assert.equal(r.notified.length, alerts.OPPORTUNITY_ALERT_MAX);
  assert.equal(r.notified[0], best);
});

test("ate 3 e-mails de oportunidade por pessoa por dia; o sino continua", async () => {
  const owner = await newUser("mentor");
  const m = await newUser("mentee", ["Scala"]);
  const now = Date.now();
  const emailed = [];
  for (let i = 0; i < 4; i++) emailed.push((await publish(owner, "Scala", now)).emailed.includes(m));
  assert.deepEqual(emailed, [true, true, true, false]);
  const count = await db.getDb().prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ?").get(m);
  assert.equal(Number(count.n), 4);
  assert.ok((await publish(owner, "Scala", now + 25 * 60 * 60 * 1000)).emailed.includes(m));
});

test("sem skills ou com perfil de quem publicou nao publico, ninguem e avisado", async () => {
  const owner = await newUser("mentor");
  await newUser("mentee", ["Clojure"]);
  assert.deepEqual((await publish(owner, "")).notified, []);
  await db.getDb().prepare("UPDATE users SET public_profile_consent = 0 WHERE id = ?").run(owner);
  assert.deepEqual((await publish(owner, "Clojure")).notified, []);
});
