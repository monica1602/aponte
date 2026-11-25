import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-inv-")), "test.db");
const { getDb } = await import("../src/lib/db.ts");
const inv = await import("../src/lib/event-invites.ts");

const db = getDb();
const tag = Date.now();
async function person(name, role = "mentee") {
  const r = await db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)").run(`${name}${tag}@t.com`, "x", `${name} ${tag}`, role);
  return Number(r.lastInsertRowid);
}
async function event(owner, status = "draft", approval = "pending") {
  const r = await db.prepare(
    "INSERT INTO events (owner_id, title, modality, starts_at, ends_at, status, approval_status, category) VALUES (?,?,?,?,?,?,?,?)"
  ).run(owner, `Grupo ${tag}`, "online", "2099-01-01T10:00", "2099-01-01T12:00", status, approval, "Grupo de estudo");
  return { id: Number(r.lastInsertRowid), title: `Grupo ${tag}`, owner_id: owner };
}
const notes = async (id) => (await db.prepare("SELECT body FROM notifications WHERE user_id = ?").all(id)).map((n) => n.body);

test("convite de evento pendente fica guardado e sai na aprovacao", async () => {
  const owner = await person("Dona");
  const guest = await person("Convidado", "mentor");
  const e = await event(owner);
  assert.equal(await inv.pendingEventCount(owner), 1);
  assert.deepEqual((await inv.searchInvitees(e.id, owner, "convid")).map((r) => r.id), [guest]);
  assert.equal(await inv.addInvite(e, "Dona", guest, false), "ok");
  assert.equal(await inv.addInvite(e, "Dona", guest, false), "duplicate");
  assert.equal(await inv.addInvite(e, "Dona", owner, false), "self");
  assert.equal((await inv.searchInvitees(e.id, owner, "convid")).length, 0);
  assert.equal((await notes(guest)).length, 0);
  assert.equal(await inv.declineInvite(e.id, guest), false);
  const done = await inv.approveEvent(e.id);
  assert.equal(done.invites, 1);
  assert.equal(await inv.approveEvent(e.id), null);
  const row = await db.prepare("SELECT status, approval_status FROM events WHERE id = ?").get(e.id);
  assert.deepEqual({ ...row }, { status: "published", approval_status: "approved" });
  assert.match((await notes(guest))[0], /convidou voce/);
  assert.match((await notes(owner))[0], /aprovou/);
  assert.equal((await inv.myInvite(e.id, guest)).status, "pending");
  assert.equal(await inv.declineInvite(e.id, guest), true);
  assert.equal((await inv.listInvites(e.id))[0].status, "declined");
});

test("recusa guarda o motivo e so vale para evento pendente", async () => {
  const owner = await person("Outra");
  const e = await event(owner);
  assert.equal((await inv.rejectEvent(e.id, "Falta descricao")).id, e.id);
  assert.equal(await inv.rejectEvent(e.id, "de novo"), null);
  assert.equal(await inv.approveEvent(e.id), null);
  const row = await db.prepare("SELECT status, approval_status, approval_note FROM events WHERE id = ?").get(e.id);
  assert.deepEqual({ ...row }, { status: "draft", approval_status: "rejected", approval_note: "Falta descricao" });
  assert.equal(await inv.pendingEventCount(owner), 0);
  assert.match((await notes(owner))[0], /Motivo: Falta descricao/);
});

test("limite de convites e bloqueio entre pessoas", async () => {
  const owner = await person("Limite");
  const e = await event(owner, "published", "approved");
  const blocked = await person("Bloq");
  await db.prepare("INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (?,?)").run(blocked, owner);
  assert.equal(await inv.addInvite(e, "Limite", blocked, true), "blocked");
  for (let i = 0; i < inv.INVITE_MAX; i++) assert.equal(await inv.addInvite(e, "Limite", await person(`P${i}x`), true), "ok");
  assert.equal(await inv.addInvite(e, "Limite", await person("Extra"), true), "full");
  assert.equal(await inv.addInvite(e, "Limite", 999999, true), "not_found");
});
