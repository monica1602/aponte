import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-history-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, history;
before(async () => {
  db = await import("../src/lib/db.ts");
  history = await import("../src/lib/event-history.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const uid = async (email) => (await db.getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)).id;
async function event() {
  const r = await db.getDb().prepare(
    "INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location) VALUES (?,?,?,?,?,?,?,?)"
  ).run(await uid("carlos@ponte.dev"), "Evento historico", "", "online", "2030-01-10T10:00", "2030-01-10T12:00", "", "");
  return Number(r.lastInsertRowid);
}

test("evento sem inscricoes nem certificados nao tem historico", async () => {
  assert.equal(await history.eventHasHistory(await event()), false);
});

test("qualquer inscricao, mesmo cancelada, conta como historico", async () => {
  const ev = await event();
  await db.getDb().prepare("INSERT INTO event_registrations (event_id, user_id, status, lgpd_accepted_at) VALUES (?,?,?,datetime('now'))")
    .run(ev, await uid("joao@email.com"), "cancelled");
  assert.equal(await history.eventHasHistory(ev), true);
});

test("certificado emitido conta como historico", async () => {
  const ev = await event();
  await db.getDb().prepare("INSERT INTO certificates (user_id, event_id, issued_by, title, verification_code) VALUES (?,?,?,?,?)")
    .run(await uid("joao@email.com"), ev, await uid("carlos@ponte.dev"), "Evento historico", `HIST${ev}`);
  assert.equal(await history.eventHasHistory(ev), true);
});
