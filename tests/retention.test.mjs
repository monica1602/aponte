import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-retention-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, retention;
before(async () => {
  db = await import("../src/lib/db.ts");
  retention = await import("../src/lib/retention.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const DAY = 24 * 60 * 60 * 1000;
// "AAAA-MM-DDTHH:MM" no horario de Brasilia, como os eventos sao gravados.
const brt = (ms) => new Date(ms - 3 * 60 * 60 * 1000).toISOString().slice(0, 16);
const utc = (ms) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");

async function eventEndedDaysAgo(days) {
  const d = db.getDb();
  const owner = (await d.prepare("SELECT id FROM users WHERE email = 'carlos@ponte.dev'").get()).id;
  const end = Date.now() - days * DAY;
  const r = await d.prepare(
    "INSERT INTO events (owner_id, title, description, modality, starts_at, ends_at, online_url, location, capacity, require_approval) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).run(owner, `Evento ${days}d`, "", "in_person", brt(end - 2 * 60 * 60 * 1000), brt(end), "", "SP", null, 0);
  return Number(r.lastInsertRowid);
}

async function register(eventId, email) {
  const d = db.getDb();
  const uid = (await d.prepare("SELECT id FROM users WHERE email = ?").get(email)).id;
  const r = await d.prepare(
    "INSERT INTO event_registrations (event_id, user_id, status, lgpd_accepted_at, checked_in_at, safe_home_at) VALUES (?,?,'approved',datetime('now'),datetime('now'),datetime('now'))"
  ).run(eventId, uid);
  return Number(r.lastInsertRowid);
}

test("prazos: apaga o que venceu e mantem o que esta dentro do prazo", async () => {
  const d = db.getDb();
  const old = await register(await eventEndedDaysAgo(400), "joao@email.com");
  const mid = await register(await eventEndedDaysAgo(3), "joao@email.com");
  const fresh = await register(await eventEndedDaysAgo(1), "joao@email.com");
  await d.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, created_at) VALUES (NULL,'antigo','t',NULL,?)").run(utc(Date.now() - 800 * DAY));
  await d.prepare("INSERT INTO audit_log (actor_id, action, entity_type, entity_id, created_at) VALUES (NULL,'recente','t',NULL,?)").run(utc(Date.now() - 700 * DAY));

  const result = await retention.runRetention();
  assert.equal(result.audit, 1);
  assert.equal(result.registrations, 1);
  assert.ok(result.safeHome >= 1);

  const reg = (id) => d.prepare("SELECT safe_home_at, safe_home_reminded_at FROM event_registrations WHERE id = ?").get(id);
  assert.equal(await reg(old), undefined);
  assert.equal((await reg(mid)).safe_home_at, null);
  assert.ok((await reg(mid)).safe_home_reminded_at, "lembrete marcado para nao reenviar");
  assert.ok((await reg(fresh)).safe_home_at);
  const actions = (await d.prepare("SELECT action FROM audit_log").all()).map((r) => r.action);
  assert.ok(!actions.includes("antigo"));
  assert.ok(actions.includes("recente"));
  assert.ok(actions.some((a) => a.startsWith("retention.cleanup auditoria=1 inscricoes=1")));
});

test("certificado so pode ser emitido ate 1 ano apos o fim do evento", () => {
  const now = Date.now();
  assert.equal(retention.canIssueCertificate(brt(now - 364 * DAY), now), true);
  assert.equal(retention.canIssueCertificate(brt(now - 366 * DAY), now), false);
  assert.equal(retention.safeHomeOpen(brt(now - 1 * DAY), now), true);
  assert.equal(retention.safeHomeOpen(brt(now - 3 * DAY), now), false);
});
