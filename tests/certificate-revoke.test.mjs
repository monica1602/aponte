import { test } from "node:test";
import assert from "node:assert/strict";
import { REVOKE_REASONS, revokeReason } from "../src/lib/certificate-revoke.ts";

test("motivo da revogacao: item da lista, texto opcional e obrigatorio em Outro", () => {
  assert.deepEqual([...REVOKE_REASONS], ["Emitido por engano", "Presenca nao confirmada", "Dados incorretos", "Outro"]);
  assert.deepEqual(revokeReason("Emitido por engano", ""), { reason: "Emitido por engano" });
  assert.deepEqual(revokeReason("Dados incorretos", "  nome errado "), { reason: "Dados incorretos: nome errado" });
  assert.ok("error" in revokeReason("Outro", "   "));
  assert.deepEqual(revokeReason("Outro", "Pedido da pessoa"), { reason: "Outro: Pedido da pessoa" });
  assert.ok("error" in revokeReason("Qualquer coisa", "x"));
  assert.ok("error" in revokeReason("", ""));
  const long = revokeReason("Outro", "a".repeat(800));
  assert.equal("reason" in long && long.reason.length, "Outro: ".length + 500);
});
