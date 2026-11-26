import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.DATABASE_URL) process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-cl-")), "test.db");
const { certificatePdfWait, recordCertificatePdf, certificatePdfWaitMessage } = await import("../src/lib/certificate-limits.ts");
const { getDb } = await import("../src/lib/db.ts");

test("PDF do certificado: 30 downloads por IP em 10 minutos, sem afetar outro IP", async () => {
  await getDb().prepare("DELETE FROM auth_attempts").run();
  for (let i = 0; i < 29; i++) await recordCertificatePdf("198.51.100.1", true);
  assert.equal(await certificatePdfWait("198.51.100.1"), 0);
  await recordCertificatePdf("198.51.100.1", true);
  assert.equal(await certificatePdfWait("198.51.100.1"), 10);
  assert.equal(await certificatePdfWait("198.51.100.2"), 0);
  assert.equal(certificatePdfWaitMessage(1), "Muitos downloads em pouco tempo. Aguarde 1 minuto e tente de novo.");
});

test("PDF do certificado: 20 codigos inexistentes por IP em 10 minutos", async () => {
  await getDb().prepare("DELETE FROM auth_attempts").run();
  for (let i = 0; i < 19; i++) await recordCertificatePdf("198.51.100.3", false);
  assert.equal(await certificatePdfWait("198.51.100.3"), 0);
  await recordCertificatePdf("198.51.100.3", false);
  assert.ok(await certificatePdfWait("198.51.100.3") > 0);
  assert.equal(await certificatePdfWait("198.51.100.4"), 0);
});
