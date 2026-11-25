import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-att-")), "test.db");
const { getDb } = await import("../src/lib/db.ts");
const { ATTACH_SITE_TOTAL, crossesSiteWarning, siteAttachmentBytes } = await import("../src/lib/attachments.ts");

const MB = 1024 * 1024;

test("limite do site: 300 MB e aviso so na passagem pelos 80%", () => {
  assert.equal(ATTACH_SITE_TOTAL, 300 * MB);
  assert.equal(crossesSiteWarning(239 * MB, 2 * MB), true);
  assert.equal(crossesSiteWarning(238 * MB, 1 * MB), false);
  assert.equal(crossesSiteWarning(240 * MB, 1 * MB), false);
  assert.equal(crossesSiteWarning(0, 240 * MB), true);
});

test("total do site soma os arquivos de todas as contas", async () => {
  const db = getDb();
  const before = await siteAttachmentBytes();
  const ids = [];
  for (const email of [`a${Date.now()}@t.com`, `b${Date.now()}@t.com`]) {
    const r = await db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?,?,?,?)").run(email, "x", "Pessoa", "mentee");
    ids.push(Number(r.lastInsertRowid));
  }
  for (const [id, size] of [[ids[0], 1000], [ids[1], 2500]]) {
    await db.prepare("INSERT INTO attachments (owner_id, scope, title, filename, mime, size, data) VALUES (?,?,?,?,?,?,?)").run(id, "profile", "t", "a.pdf", "application/pdf", size, "");
  }
  assert.equal(await siteAttachmentBytes(), before + 3500);
});
