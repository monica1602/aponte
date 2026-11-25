import { test } from "node:test";
import assert from "node:assert/strict";
import { isPreview } from "../src/lib/environment.ts";

test("so a previa do Vercel e identificada como ambiente de teste", () => {
  const before = process.env.VERCEL_ENV;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.equal(isPreview(), true);
    process.env.VERCEL_ENV = "production";
    assert.equal(isPreview(), false);
    process.env.VERCEL_ENV = "development";
    assert.equal(isPreview(), false);
    delete process.env.VERCEL_ENV;
    assert.equal(isPreview(), false);
  } finally {
    if (before === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = before;
  }
});
