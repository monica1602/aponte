import { test, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ponte-legal-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");

let db, legal, versions;
before(async () => {
  db = await import("../src/lib/db.ts");
  legal = await import("../src/lib/legal-acceptance.ts");
  versions = await import("../src/lib/legal-versions.ts");
  await db.getDb().prepare("SELECT 1").get();
});

const id = async (email) => (await db.getDb().prepare("SELECT id FROM users WHERE email = ?").get(email)).id;

test("contas existentes recebem a versao 1 dos tres documentos com a data antiga", async () => {
  const ana = await id("ana@ponte.dev");
  const rows = await legal.legalAcceptanceHistory(ana);
  assert.deepEqual(rows.map((r) => r.doc).sort(), ["conduct", "privacy", "terms"]);
  assert.ok(rows.every((r) => r.version === 1 && r.source === "anterior"));
  const u = await db.getUser(ana);
  assert.equal(rows.find((r) => r.doc === "terms").accepted_at, u.employment_terms_accepted_at);
  assert.deepEqual(await legal.pendingLegalDocs(ana), []);
});

test("conta sem aceite fica pendente ate gravar a versao em vigor", async () => {
  const r = await db.getDb().prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('novo@x.dev','x','Novo','mentee')").run();
  const uid = Number(r.lastInsertRowid);
  assert.deepEqual(await legal.pendingLegalDocs(uid), ["terms", "privacy", "conduct"]);
  await legal.recordLegalAcceptance(uid, "cadastro");
  assert.deepEqual(await legal.pendingLegalDocs(uid), []);
});

test("versao nova pede novo aceite so do documento que mudou", () => {
  assert.deepEqual(versions.docsBehind({ terms: 1, privacy: 1, conduct: 1 }), []);
  assert.deepEqual(versions.docsBehind({ terms: 1, conduct: 1 }), ["privacy"]);
  versions.LEGAL_VERSIONS.terms.push({ version: 2, effectiveFrom: "2027-01-01", summary: "teste" });
  try {
    assert.deepEqual(versions.docsBehind({ terms: 1, privacy: 1, conduct: 1 }), ["terms"]);
    assert.deepEqual(versions.docsBehind({ terms: 2, privacy: 1, conduct: 1 }), []);
  } finally {
    versions.LEGAL_VERSIONS.terms.pop();
  }
});
