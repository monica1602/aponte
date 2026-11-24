import { test } from "node:test";
import assert from "node:assert/strict";
import { mask, formatLog, errorFields, installConsoleMask } from "../src/lib/log.ts";

test("mascara e-mails, links com codigo, credenciais e tokens", () => {
  assert.equal(mask("link para maria@email.com: https://site.dev/verificar-email?t=abc&r=nao"), "link para [e-mail]: https://site.dev/verificar-email?[oculto]");
  assert.equal(mask("postgres://user:senha@ep-x.neon.tech/db"), "postgres://[oculto]@ep-x.neon.tech/db");
  assert.equal(mask("Authorization: Bearer abc.def"), "Authorization: Bearer [oculto]");
  assert.equal(mask("abriu /redefinir-senha?token=xyz agora"), "abriu /redefinir-senha?[oculto] agora");
  assert.equal(mask("codigo AbCdEfGhIjKlMnOpQrStUvWxYz0123456789"), "codigo [oculto]");
  assert.equal(mask("rota /eventos/[id] respondeu 3.5 s"), "rota /eventos/[id] respondeu 3.5 s");
});

test("log estruturado: 1 linha JSON com data, nivel, area e campos mascarados", () => {
  const line = formatLog("warn", "meus-dados", "e-mail para ana@ponte.dev", { status: 422, password: "x", detalhe: "to: b@c.com" }, new Date("2026-11-24T12:00:00Z"));
  assert.ok(!line.includes("\n"));
  assert.deepEqual(JSON.parse(line), { ts: "2026-11-24T12:00:00.000Z", nivel: "warn", area: "meus-dados", msg: "e-mail para [e-mail]", status: 422, password: "[oculto]", detalhe: "to: [e-mail]" });
});

test("campos do erro trazem tipo, mensagem e digest", () => {
  const e = Object.assign(new TypeError("falhou"), { digest: "123" });
  assert.deepEqual(errorFields(e), { erro: "TypeError", detalhe: "falhou", digest: "123" });
  assert.deepEqual(errorFields("x"), { erro: "string", detalhe: "x" });
});

test("mensagens do Next.js e de bibliotecas tambem saem em JSON mascarado", () => {
  const out = [];
  const fake = { log: (l) => out.push(l), info: (l) => out.push(l), warn: (l) => out.push(l), error: (l) => out.push(l) };
  installConsoleMask(fake);
  fake.error("⨯ Error: falha para %s", "ana@ponte.dev");
  fake.warn(formatLog("warn", "x", "ja estruturado"));
  const first = JSON.parse(out[0]);
  assert.equal(first.nivel, "error");
  assert.equal(first.area, "next");
  assert.equal(first.msg, "⨯ Error: falha para [e-mail]");
  assert.equal(JSON.parse(out[1]).area, "x");
});
