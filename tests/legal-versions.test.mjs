import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGAL_VERSIONS, currentVersion, resolveVersion, versionLabel } from "../src/lib/legal-versions.ts";

test("cada documento tem versoes em ordem, sem numero repetido", () => {
  for (const doc of ["terms", "privacy", "conduct"]) {
    const nums = LEGAL_VERSIONS[doc].map((v) => v.version);
    assert.deepEqual(nums, [...nums].sort((a, b) => a - b));
    assert.equal(new Set(nums).size, nums.length);
    assert.ok(LEGAL_VERSIONS[doc].every((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.effectiveFrom) && v.summary));
  }
});

test("versao pedida, inexistente ou vazia", () => {
  assert.equal(resolveVersion("terms", "1").version.version, 1);
  assert.equal(resolveVersion("terms", "1").isCurrent, true);
  assert.equal(resolveVersion("terms", "9").version.version, currentVersion("terms").version);
  assert.equal(resolveVersion("privacy", undefined).isCurrent, true);
  assert.equal(resolveVersion("conduct", ["abc"]).version.version, currentVersion("conduct").version);
});

test("rotulo com a data no formato brasileiro", () => {
  assert.equal(versionLabel({ version: 1, effectiveFrom: "2026-11-23", summary: "x" }), "Versao 1 — em vigor desde 23/11/2026");
});
