import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordProblem } from "../src/lib/password-policy.ts";

test("aceita senha com 8+ caracteres, maiuscula, minuscula, numero e especial", () => {
  assert.equal(passwordProblem("Ponte@2026"), null);
  assert.equal(passwordProblem("Ação#123"), null);
});

test("rejeita senhas fracas e diz o que falta", () => {
  assert.match(passwordProblem("Ab1!"), /pelo menos 8 caracteres/);
  assert.match(passwordProblem("ponte@2026"), /maiuscula/);
  assert.match(passwordProblem("PONTE@2026"), /minuscula/);
  assert.match(passwordProblem("Ponte@abc"), /numero/);
  assert.match(passwordProblem("Ponte2026"), /caractere especial/);
  assert.equal(passwordProblem("senha123"), "A senha precisa ter uma letra maiuscula e um caractere especial.");
});
