import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { certificatePdf } from "../src/lib/certificate-pdf.ts";

const textOf = (bytes) => {
  const buf = Buffer.from(bytes);
  let raw = buf.toString("latin1");
  for (const m of raw.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const end = raw.indexOf("endstream", start);
    try { raw += zlib.inflateSync(buf.subarray(start, end)).toString("latin1"); } catch { /* fluxo sem compressao */ }
  }
  return [...raw.matchAll(/<([0-9A-Fa-f]+)> Tj/g)].map((m) => Buffer.from(m[1], "hex").toString("latin1")).join("\n");
};

test("PDF do certificado tem uma pagina A4 deitada e os dados do certificado", async () => {
  const bytes = await certificatePdf(
    { title: "Oficina de React", verification_code: "ABC123", issued_at: "2026-11-23 20:00:00", recipient_name: "João Pedro", issuer_name: null, starts_at: "2026-11-20T18:00" },
    "https://exemplo.dev/certificados/ABC123"
  );
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 842, height: 595 });
  const text = textOf(bytes);
  for (const s of ["João Pedro", "Oficina de React", "em 20/11/2026", "Emitido pela plataforma Ponte em 23/11/2026", "ABC123", "https://exemplo.dev/certificados/ABC123"]) {
    assert.ok(text.includes(s), `faltou: ${s}`);
  }
});

test("caracteres fora das fontes do PDF nao quebram a geracao", async () => {
  const bytes = await certificatePdf(
    { title: "Evento 🚀 com emoji e um titulo bem longo ".repeat(4), verification_code: "X1", issued_at: "2026-11-23 20:00:00", recipient_name: "Ana 🙂", issuer_name: "Carlos", starts_at: null },
    "https://exemplo.dev/certificados/X1"
  );
  assert.ok(textOf(bytes).includes("Ana"));
});

test("PDF do certificado tem o QR code de validacao com a legenda", async () => {
  const bytes = await certificatePdf(
    { title: "Oficina", verification_code: "QR1", issued_at: "2026-11-23 20:00:00", recipient_name: "Ana", issuer_name: "Carlos", starts_at: null },
    "https://exemplo.dev/certificados/QR1"
  );
  assert.match(Buffer.from(bytes).toString("latin1"), /\/Subtype \/Image/);
  assert.ok(textOf(bytes).includes("Escaneie para validar"));
});

test("certificado mostra carga horaria, organizador, responsavel e assinatura", async () => {
  const bytes = await certificatePdf(
    { title: "Oficina", verification_code: "W1", issued_at: "2026-11-23 20:00:00", recipient_name: "Ana", starts_at: "2026-11-20T18:00",
      modality: "in_person", city: "Recife", state: "PE", workload_minutes: 150, organizer_name: "Comunidade X", responsible_name: "Carlos Lima", theme: "dourado" },
    "https://exemplo.dev/certificados/W1"
  );
  const text = textOf(bytes);
  for (const s of ["em 20/11/2026 · Presencial · Recife/PE", "com carga horaria de 2h30", "Organizado por Comunidade X", "Carlos Lima", "Responsavel pelo evento", "Assinatura eletronica"]) {
    assert.ok(text.includes(s), `faltou: ${s}`);
  }
});

test("os 5 modelos geram o PDF, e um modelo desconhecido usa o classico", async () => {
  const { CERTIFICATE_THEMES, certificateTheme, formatWorkload } = await import("../src/lib/certificate-themes.ts");
  assert.equal(CERTIFICATE_THEMES.length, 5);
  for (const t of [...CERTIFICATE_THEMES.map((x) => x.id), "inexistente"]) {
    const bytes = await certificatePdf({ title: "T", verification_code: "M", issued_at: "2026-11-23 20:00:00", recipient_name: "Ana", starts_at: null, theme: t }, "https://e.dev/c/M");
    assert.equal((await PDFDocument.load(bytes)).getPageCount(), 1);
  }
  assert.equal(certificateTheme("inexistente").id, "classico");
  assert.deepEqual([formatWorkload(150), formatWorkload(120), formatWorkload(45), formatWorkload(null)], ["2h30", "2h", "45min", ""]);
});
