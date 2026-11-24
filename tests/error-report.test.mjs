import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

if (!process.env.DATABASE_URL) process.env.DATABASE_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ponte-err-")), "test.db");
delete process.env.BASE_URL;
const { reportServerError, errorKey, pathOnly } = await import("../src/lib/error-report.ts");

function capture() {
  const lines = [];
  const original = console.error;
  console.error = (line) => lines.push(String(line));
  return { lines, restore: () => (console.error = original) };
}

test("tipo de erro usa a rota do arquivo, sem ids nem query", () => {
  assert.equal(errorKey(new TypeError("x"), { routeType: "render", routePath: "/eventos/[id]" }), "render:/eventos/[id]:TypeError");
  assert.equal(pathOnly("/redefinir-senha?token=abc#x"), "/redefinir-senha");
});

test("1 aviso por tipo de erro por hora, log sem dados da pessoa", async () => {
  const sent = [];
  const send = async (text, link) => sent.push({ text, link });
  const req = { path: "/eventos/12?t=segredo", method: "GET", headers: { host: "ponte.test", "x-forwarded-proto": "https" } };
  const ctx = { routeType: "render", routePath: `/teste-${Date.now()}/[id]` };
  const err = Object.assign(new Error("falha para maria@email.com"), { digest: "999" });
  const out = capture();
  try {
    await reportServerError(err, req, ctx, send);
    await reportServerError(err, req, ctx, send);
    await reportServerError(new RangeError("outro"), req, ctx, send);
  } finally {
    out.restore();
  }
  assert.equal(sent.length, 2);
  assert.match(sent[0].text, /pagina \/teste-\d+\/\[id\]\): Error\. Codigo 999/);
  assert.equal(sent[0].link, "https://ponte.test/admin");
  assert.match(sent[1].text, /RangeError/);
  const logs = out.lines.filter((l) => l.startsWith("{")).map((l) => JSON.parse(l)).filter((e) => e.area === "servidor");
  assert.equal(logs.length, 3, out.lines.join("\n"));
  const entry = logs[0];
  assert.equal(entry.area, "servidor");
  assert.equal(entry.caminho, "/eventos/12");
  assert.equal(entry.detalhe, "falha para [e-mail]");
  assert.ok(!out.lines.join("").includes("segredo"));
});

test("falha ao enviar o aviso nao lanca erro", async () => {
  const out = capture();
  try {
    await reportServerError(new Error("x"), { path: "/", method: "POST" }, { routeType: "action", routePath: `/falha-${Date.now()}` }, async () => {
      throw new Error("sem rede");
    });
  } finally {
    out.restore();
  }
  assert.equal(out.lines.filter((l) => l.includes('"area":"servidor"')).length, 1);
});
