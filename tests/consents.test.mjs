import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-consents-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, consents;
before(async () => {
  db = await import("../src/lib/db.ts");
  consents = await import("../src/lib/consents.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const id = async (email) => (await db.getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)).id;

test("contas existentes recebem o perfil publico como anterior ao registro, com a data gravada", async () => {
  const ana = await id("ana@ponte.dev");
  const u = await db.getUser(ana);
  const rows = (await consents.consentHistory(ana)).filter((r) => r.consent === "public_profile");
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].granted), 1);
  assert.equal(rows[0].source, "anterior");
  assert.equal(rows[0].created_at, u.public_profile_consent_at);
});

test("consentimento de evento fica ligado ao evento no historico", async () => {
  const maria = await id("maria@email.com");
  const ev = await db.getDb().prepare("SELECT id, title FROM events LIMIT 1").get();
  assert.ok(ev, "seed sem eventos");
  await consents.recordConsent(maria, "event_privacy", true, "inscricao_evento", ev.id);
  const row = (await consents.consentHistory(maria)).find((r) => r.consent === "event_privacy");
  assert.equal(Number(row.event_id), Number(ev.id));
  assert.equal(row.event_title, ev.title);
});

test("so grava o que mudou: revogar e conceder de novo viram duas linhas", async () => {
  const joao = await id("joao@email.com");
  const before = (await consents.consentHistory(joao)).length;
  await consents.recordConsentChanges(joao, [["public_profile", true, true], ["image", false, false]], "perfil");
  assert.equal((await consents.consentHistory(joao)).length, before);
  await consents.recordConsentChanges(joao, [["public_profile", true, false]], "perfil");
  await consents.recordConsentChanges(joao, [["public_profile", false, true]], "perfil");
  const rows = (await consents.consentHistory(joao)).filter((r) => r.source === "perfil");
  assert.deepEqual(rows.map((r) => Number(r.granted)).sort(), [0, 1]);
  assert.equal((await consents.consentHistory(joao)).length, before + 2);
});
