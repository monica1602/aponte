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
  for (const s of ["João Pedro", "Oficina de React", "em 20/11/2026", "Emitido por conta excluida em 23/11/2026", "ABC123", "https://exemplo.dev/certificados/ABC123"]) {
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
