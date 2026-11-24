import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-waitlist-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, waitlist;
before(async () => {
  db = await import("../src/lib/db.ts");
  waitlist = await import("../src/lib/waitlist.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const HOUR = 60 * 60 * 1000;
const brt = (ms) => new Date(ms - 3 * HOUR).toISOString().slice(0, 16);
const uid = async (email) => (await db.getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)).id;

async function event({ capacity = 1, approval = 0, endsIn = 48 * HOUR } = {}) {
  const end = Date.now() + endsIn;
  const r = await db.getDb().prepare(
    "INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location, capacity, require_approval) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(await uid("carlos@ponte.dev"), "Evento lista", "", "online", brt(end - 2 * HOUR), brt(end), "", "", capacity, approval);
  return Number(r.lastInsertRowid);
}

async function reg(eventId, email, status, createdAt) {
  const r = await db.getDb().prepare(
    "INSERT INTO event_registrations (event_id, user_id, status, lgpd_accepted_at, created_at) VALUES (?,?,?,datetime('now'),?)"
  ).run(eventId, await uid(email), status, createdAt);
  return Number(r.lastInsertRowid);
}

const statusOf = async (id) => (await db.getDb().prepare("SELECT status FROM event_registrations WHERE id = ?").get(id)).status;

test("vaga aberta promove a inscricao mais antiga da lista de espera", async () => {
  const ev = await event();
  const first = await reg(ev, "joao@email.com", "declined", "2026-01-01 10:00:00");
  const late = await reg(ev, "maria@email.com", "waitlist", "2026-01-03 10:00:00");
  const early = await reg(ev, "pedro@email.com", "waitlist", "2026-01-02 10:00:00");
  const promoted = await waitlist.promoteWaitlist(ev, null);
  assert.deepEqual(promoted.map((p) => [p.registrationId, p.status]), [[early, "approved"]]);
  assert.equal(await statusOf(early), "approved");
  assert.equal(await statusOf(late), "waitlist");
  assert.equal(await statusOf(first), "declined");
});

test("com aprovacao manual, a pessoa promovida aguarda aprovacao e ocupa a vaga", async () => {
  const ev = await event({ capacity: 2, approval: 1 });
  const a = await reg(ev, "joao@email.com", "waitlist", "2026-01-01 10:00:00");
  const b = await reg(ev, "maria@email.com", "waitlist", "2026-01-02 10:00:00");
  const c = await reg(ev, "pedro@email.com", "waitlist", "2026-01-03 10:00:00");
  const promoted = await waitlist.promoteWaitlist(ev, null);
  assert.deepEqual(promoted.map((p) => p.status), ["requested", "requested"]);
  assert.equal(await statusOf(a), "requested");
  assert.equal(await statusOf(b), "requested");
  assert.equal(await statusOf(c), "waitlist");
});

test("sem vaga livre ou com o evento encerrado, ninguem e promovido", async () => {
  const full = await event();
  await reg(full, "joao@email.com", "approved", "2026-01-01 10:00:00");
  const waiting = await reg(full, "maria@email.com", "waitlist", "2026-01-02 10:00:00");
  assert.equal((await waitlist.promoteWaitlist(full, null)).length, 0);
  assert.equal(await statusOf(waiting), "waitlist");

  const ended = await event({ endsIn: -HOUR });
  const old = await reg(ended, "pedro@email.com", "waitlist", "2026-01-02 10:00:00");
  assert.equal((await waitlist.promoteWaitlist(ended, null)).length, 0);
  assert.equal(await statusOf(old), "waitlist");
});
