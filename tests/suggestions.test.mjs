import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-suggestions-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, sug;
before(async () => {
  db = await import("../src/lib/db.ts");
  sug = await import("../src/lib/suggestions.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const user = async (email) => db.getUser((await db.getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)).id);

async function newUser(email, role, profile) {
  const r = await db.getDb().prepare(
    "INSERT INTO users (email, password_hash, name, role, public_profile_consent) VALUES (?,?,?,?,1)"
  ).run(email, "x", email.split("@")[0], role);
  const id = Number(r.lastInsertRowid);
  if (profile) await db.getDb().prepare("INSERT INTO profiles (user_id, data) VALUES (?,?)").run(id, JSON.stringify(profile));
  return db.getUser(id);
}

test("mentorado: ate 3 mentores, sem a propria pessoa nem vinculos, em ordem de compatibilidade", async () => {
  const pedro = await user("pedro@email.com");
  const linked = (await db.getDb().prepare("SELECT mentor_id FROM mentorships WHERE mentee_id = ?").all(pedro.id)).map((r) => Number(r.mentor_id));
  const s = await sug.dashboardSuggestions(pedro);
  assert.equal(s.needsProfile, false);
  assert.equal(s.searchHref, "/mentores");
  assert.ok(s.items.length > 0 && s.items.length <= 3);
  for (const i of s.items) {
    assert.notEqual(i.id, pedro.id);
    assert.ok(!linked.includes(Number(i.id)));
    assert.ok(i.match.percent > 0);
  }
  const pct = s.items.map((i) => i.match.percent);
  assert.deepEqual(pct, [...pct].sort((a, b) => b - a));
});

test("mentor com pedido de mentoria ou bloqueio deixa de ser sugerido", async () => {
  const lia = await newUser("lia-sug@x.test", "mentee", { learnTools: ["React", "Python", "SQL"], areas: ["Desenvolvimento Web"] });
  const first = (await sug.dashboardSuggestions(lia)).items;
  assert.ok(first.length >= 2);
  await db.getDb().prepare("INSERT INTO mentorships (mentor_id, mentee_id, status) VALUES (?,?, 'pending')").run(first[0].id, lia.id);
  await db.getDb().prepare("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)").run(first[1].id, lia.id);
  const ids = (await sug.dashboardSuggestions(lia)).items.map((i) => i.id);
  assert.ok(!ids.includes(first[0].id));
  assert.ok(!ids.includes(first[1].id));
});

test("conta inativa ou sem perfil publico nao aparece", async () => {
  const leo = await newUser("leo-sug@x.test", "mentee", { learnTools: ["Kotlin"] });
  const mentor = await newUser("kotlin-sug@x.test", "mentor", { tools: ["Kotlin"] });
  assert.deepEqual((await sug.dashboardSuggestions(leo)).items.map((i) => i.id).slice(0, 1), [mentor.id]);
  await db.getDb().prepare("UPDATE users SET account_status = 'blocked' WHERE id = ?").run(mentor.id);
  assert.ok(!(await sug.dashboardSuggestions(leo)).items.some((i) => i.id === mentor.id));
  await db.getDb().prepare("UPDATE users SET account_status = 'active', public_profile_consent = 0 WHERE id = ?").run(mentor.id);
  assert.ok(!(await sug.dashboardSuggestions(leo)).items.some((i) => i.id === mentor.id));
});

test("perfil vazio pede para completar o perfil", async () => {
  const s = await sug.dashboardSuggestions(await newUser("vazio-sug@x.test", "mentee"));
  assert.equal(s.needsProfile, true);
  assert.deepEqual(s.items, []);
});

test("mentor recebe mentorados fora da propria rede", async () => {
  const ana = await user("ana@ponte.dev");
  const mine = (await db.getDb().prepare("SELECT mentee_id FROM mentorships WHERE mentor_id = ?").all(ana.id)).map((r) => Number(r.mentee_id));
  const s = await sug.dashboardSuggestions(ana);
  assert.equal(s.needsProfile, false);
  for (const i of s.items) assert.ok(!mine.includes(Number(i.id)));
});

test("empresa usa o projeto mais recente; sem projeto, pede um projeto", async () => {
  const co = await newUser("empresa-sug@x.test", "company");
  assert.equal((await sug.dashboardSuggestions(co)).needsProfile, true);
  const r = await db.getDb().prepare(
    "INSERT INTO projects (owner_id, kind, title, tools, areas, status) VALUES (?, 'empresarial', 'Painel', 'Python,SQL', '', 'aberto')"
  ).run(co.id);
  const s = await sug.dashboardSuggestions(co);
  assert.equal(s.needsProfile, false);
  assert.equal(s.searchHref, `/talentos?projeto=${Number(r.lastInsertRowid)}`);
  assert.ok(s.items.length > 0);
});
