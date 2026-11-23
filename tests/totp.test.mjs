import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, matchTotp, newRecoveryCodes, normalizeRecoveryCode, totpAt, STEP_S } from "../src/lib/totp.ts";

const RFC_SECRET = Buffer.from("12345678901234567890");

test("codigos iguais aos do RFC 6238 (aplicativos de celular)", () => {
  assert.equal(totpAt(RFC_SECRET, Math.floor(59 / STEP_S), 8), "94287082");
  assert.equal(totpAt(RFC_SECRET, Math.floor(1111111109 / STEP_S), 8), "07081804");
  assert.equal(totpAt(RFC_SECRET, Math.floor(20000000000 / STEP_S), 8), "65353130");
});

test("base32 ida e volta", () => {
  assert.equal(base32Encode(RFC_SECRET), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq"), RFC_SECRET);
});

test("aceita o passo atual e o vizinho, recusa reuso e codigo errado", () => {
  const b32 = base32Encode(RFC_SECRET);
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 1000 / STEP_S);
  const code = totpAt(RFC_SECRET, step);
  assert.equal(matchTotp(b32, code, 0, now), step);
  assert.equal(matchTotp(b32, code, step, now), 0);
  assert.equal(matchTotp(b32, totpAt(RFC_SECRET, step - 1), 0, now), step - 1);
  assert.equal(matchTotp(b32, totpAt(RFC_SECRET, step - 3), 0, now), 0);
  assert.equal(matchTotp(b32, "12345", 0, now), 0);
});

test("codigos de recuperacao", () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0], /^[a-f0-9]{4}-[a-f0-9]{4}$/);
  assert.equal(normalizeRecoveryCode(" AB12-cd34 "), "ab12cd34");
});
