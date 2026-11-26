import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-del-")), "test.db");
const { getDb } = await import("../src/lib/db.ts");
const del = await import("../src/lib/admin-delete.ts");

const db = getDb();
const tag = Date.now();
let seq = 0;
async function person(name, role = "mentee", status = "pending") {
  const r = await db.prepare("INSERT INTO users (email, password_hash, name, role, email_status) VALUES (?,?,?,?,?)").run(`${name}${tag}${++seq}@t.com`, "x", `${name} ${tag}`, role, status);
  return Number(r.lastInsertRowid);
}
async function event(owner, starts, ends) {
  const r = await db.prepare("INSERT INTO events (owner_id, title, modality, starts_at, ends_at, status) VALUES (?,?,?,?,?,?)").run(owner, `Evento ${tag} ${++seq}`, "online", starts, ends, "published");
  return Number(r.lastInsertRowid);
}
async function project(owner) {
  const r = await db.prepare("INSERT INTO projects (owner_id, kind, title, description) VALUES (?,?,?,?)").run(owner, "educacional", `Projeto ${tag} ${++seq}`, "d");
  return Number(r.lastInsertRowid);
}
async function cert(user, eventId) {
  const r = await db.prepare("INSERT INTO certificates (user_id, event_id, verification_code, title) VALUES (?,?,?,?)").run(user, eventId, `C${tag}${++seq}`, "Certificado");
  return Number(r.lastInsertRowid);
}
const one = async (sql, ...p) => Number(Object.values(await db.prepare(sql).get(...p))[0]);
const notes = async (id) => (await db.prepare("SELECT body FROM notifications WHERE user_id = ?").all(id)).map((n) => n.body);
const n = (preview, label) => preview.removed.find((r) => r.label === label)?.n;

test("evento passado, em andamento e futuro: exclui inscricoes e mantem certificados validos", async () => {
  const owner = await person("Org", "mentor", "verified");
  const guest = await person("Guest");
  for (const [s, e] of [["2020-01-01T10:00", "2020-01-01T12:00"], ["2000-01-01T00:00", "2099-01-01T00:00"], ["2099-01-01T10:00", "2099-01-01T12:00"]]) {
    const id = await event(owner, s, e);
    await db.prepare("INSERT INTO event_registrations (event_id, user_id, status, lgpd_accepted_at) VALUES (?,?,?,?)").run(id, guest, "approved", "2026-01-01");
    const c = await cert(guest, id);
    const preview = await del.deletionPreview("evento", id);
    assert.equal(n(preview, "Inscricoes"), 1);
    assert.match(preview.kept[0], /1 certificado/);
    assert.ok(await del.deleteAsAdmin("evento", id, "teste"));
    assert.equal(await one("SELECT COUNT(*) FROM events WHERE id = ?", id), 0);
    assert.equal(await one("SELECT COUNT(*) FROM event_registrations WHERE event_id = ?", id), 0);
    assert.equal(await one("SELECT COUNT(*) FROM certificates WHERE id = ? AND revoked_at IS NULL", c), 1);
  }
  assert.equal((await notes(guest)).filter((b) => b.includes("foi excluido pela administracao")).length, 3);
  assert.equal(await del.deleteAsAdmin("evento", 999999, "x"), null);
});

test("projeto: exclui tarefas, entregas e candidaturas e avisa participantes", async () => {
  const owner = await person("Dono", "mentor", "verified");
  const member = await person("Membro");
  const id = await project(owner);
  await db.prepare("INSERT INTO project_applications (project_id, user_id, status) VALUES (?,?,?)").run(id, member, "accepted");
  const t = await db.prepare("INSERT INTO project_tasks (project_id, title, created_by) VALUES (?,?,?)").run(id, "Tarefa", owner);
  await db.prepare("INSERT INTO project_deliveries (task_id, author_id, body) VALUES (?,?,?)").run(Number(t.lastInsertRowid), member, "feito");
  const preview = await del.deletionPreview("projeto", id);
  assert.equal(n(preview, "Candidaturas e participantes"), 1);
  assert.equal(n(preview, "Tarefas"), 1);
  assert.equal(n(preview, "Entregas"), 1);
  await del.deleteAsAdmin("projeto", id, "fora da conformidade");
  assert.equal(await one("SELECT COUNT(*) FROM projects WHERE id = ?", id), 0);
  assert.equal(await one("SELECT COUNT(*) FROM project_tasks WHERE project_id = ?", id), 0);
  assert.ok((await notes(member)).some((b) => b.includes("O projeto")));
  assert.ok((await del.listAllProjects()).every((p) => p.id !== id));
});

test("conta pendente e confirmada: exclui a conta, seus eventos e projetos, e registra o motivo", async () => {
  const pending = await person("Pendente");
  const owner = await person("Confirmada", "mentor", "verified");
  const guest = await person("Aluno");
  const ev = await event(owner, "2099-01-01T10:00", "2099-01-01T12:00");
  await db.prepare("INSERT INTO event_registrations (event_id, user_id, status, lgpd_accepted_at) VALUES (?,?,?,?)").run(ev, guest, "approved", "2026-01-01");
  const c = await cert(guest, ev);
  await project(owner);
  const preview = await del.deletionPreview("conta", owner);
  assert.equal(n(preview, "Eventos criados por esta conta"), 1);
  assert.equal(n(preview, "Projetos criados por esta conta"), 1);
  assert.equal(n(preview, "Inscricoes de outras pessoas nesses eventos"), 1);
  assert.match(preview.subtitle, /confirmado/);
  assert.equal((await del.deletionPreview("conta", pending)).list, "/admin/mentorados");
  await del.deleteAsAdmin("conta", pending, "cadastro duplicado");
  await del.deleteAsAdmin("conta", owner, "e-mail errado");
  assert.equal(await one("SELECT COUNT(*) FROM users WHERE id IN (?,?)", pending, owner), 0);
  assert.equal(await one("SELECT COUNT(*) FROM events WHERE owner_id = ?", owner), 0);
  assert.equal(await one("SELECT COUNT(*) FROM projects WHERE owner_id = ?", owner), 0);
  assert.equal(await one("SELECT COUNT(*) FROM certificates WHERE id = ?", c), 1);
  assert.equal(await one("SELECT COUNT(*) FROM users WHERE id = ?", guest), 1);
  const log = await del.recentDeletions();
  assert.deepEqual(log.slice(0, 2).map((d) => [d.entity_type, d.detail, d.reason]), [["conta", "Mentor", "e-mail errado"], ["conta", "Mentorado", "cadastro duplicado"]]);
  assert.ok(log.every((d) => !d.reason.includes("@") && !d.detail.includes("@")));
});
