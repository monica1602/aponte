import { test } from "node:test";
import assert from "node:assert/strict";
import { historyDate, historyLabel } from "../src/lib/certificate-history.ts";

test("linha do tempo do certificado: emissao, revogacao com motivo e desfazer", () => {
  assert.equal(historyLabel({ action: "self_issued", by_admin: 0, reason: null, actor_name: "Joao" }), "Emitido pelo participante");
  assert.equal(historyLabel({ action: "issued", by_admin: 0, reason: null, actor_name: "Ana Souza" }), "Emitido pela organizacao (Ana Souza)");
  assert.equal(historyLabel({ action: "issued", by_admin: 0, reason: null, actor_name: null }), "Emitido pela organizacao");
  assert.equal(historyLabel({ action: "revoked", by_admin: 0, reason: "Dados incorretos: nome", actor_name: "Ana Souza" }),
    "Revogado pela organizacao (Ana Souza). Motivo: Dados incorretos: nome");
  assert.equal(historyLabel({ action: "revoked", by_admin: 1, reason: null, actor_name: null }), "Revogado pela administracao");
  assert.equal(historyLabel({ action: "unrevoked", by_admin: 1, reason: null, actor_name: null }), "Revogacao desfeita pela administracao");
  assert.equal(historyDate("2026-11-24 13:05:00"), "24/11/2026, 10:05");
});
