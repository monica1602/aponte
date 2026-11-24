import { test } from "node:test";
import assert from "node:assert/strict";
import { MESSAGE_MAX, messageProblem, messageTime, otherOf, pair } from "../src/lib/messages.ts";

test("mensagens: par ordenado, outra pessoa, tamanho e horario", () => {
  assert.deepEqual(pair(9, 3), [3, 9]);
  assert.deepEqual(pair(3, 9), [3, 9]);
  assert.equal(otherOf({ user_a: 3, user_b: 9 }, 3), 9);
  assert.equal(otherOf({ user_a: 3, user_b: null }, 3), null);
  assert.equal(messageProblem(""), "Escreva a mensagem.");
  assert.equal(messageProblem("x".repeat(MESSAGE_MAX)), null);
  assert.match(messageProblem("x".repeat(MESSAGE_MAX + 1)), /ate 2000 caracteres/);
  assert.equal(messageTime("2026-11-24 13:05:00"), "24/11/2026, 10:05");
});
