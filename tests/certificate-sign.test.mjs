import { test } from "node:test";
import assert from "node:assert/strict";
import forge from "node-forge";
import { PDFDocument } from "pdf-lib";
import { certificatePdf } from "../src/lib/certificate-pdf.ts";
import { signCertificatePdf } from "../src/lib/certificate-sign.ts";

const sample = () => certificatePdf(
  { title: "Oficina", verification_code: "SIG123", issued_at: "2026-11-23 20:00:00", recipient_name: "Maria", starts_at: "2026-11-20T18:00" },
  "https://exemplo.dev/certificados/SIG123"
);

function testP12(passphrase) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 86400000);
  const attrs = [{ name: "commonName", value: "Ponte teste" }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  return Buffer.from(forge.asn1.toDer(asn1).getBytes(), "binary").toString("base64");
}

test("sem chave configurada, o PDF sai sem assinatura", async () => {
  delete process.env.CERTIFICATE_SIGNING_P12;
  const pdf = await sample();
  const out = await signCertificatePdf(pdf, "https://exemplo.dev");
  assert.equal(Buffer.compare(Buffer.from(out), Buffer.from(pdf)), 0);
  assert.ok(!Buffer.from(out).toString("latin1").includes("/ByteRange"));
});

test("com chave configurada, o PDF sai assinado pela Ponte e continua legivel", async () => {
  process.env.CERTIFICATE_SIGNING_P12 = testP12("segredo");
  process.env.CERTIFICATE_SIGNING_PASSWORD = "segredo";
  try {
    const out = Buffer.from(await signCertificatePdf(await sample(), "https://exemplo.dev"));
    const raw = out.toString("latin1");
    assert.ok(raw.includes("/ByteRange"));
    assert.ok(raw.includes("/adbe.pkcs7.detached"));
    assert.ok(raw.includes("(Ponte)"));
    assert.equal((await PDFDocument.load(out)).getPageCount(), 1);
  } finally {
    delete process.env.CERTIFICATE_SIGNING_P12;
    delete process.env.CERTIFICATE_SIGNING_PASSWORD;
  }
});

test("com senha errada, o PDF sai sem assinatura, sem quebrar o download", async () => {
  process.env.CERTIFICATE_SIGNING_P12 = testP12("certa");
  process.env.CERTIFICATE_SIGNING_PASSWORD = "errada";
  const errors = console.error;
  console.error = () => {};
  try {
    const pdf = await sample();
    const out = await signCertificatePdf(pdf, "https://exemplo.dev");
    assert.ok(!Buffer.from(out).toString("latin1").includes("/ByteRange"));
    assert.equal((await PDFDocument.load(out)).getPageCount(), 1);
  } finally {
    console.error = errors;
    delete process.env.CERTIFICATE_SIGNING_P12;
    delete process.env.CERTIFICATE_SIGNING_PASSWORD;
  }
});
