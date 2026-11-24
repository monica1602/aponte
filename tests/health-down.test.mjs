import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATABASE_URL = "postgres://ponte:x@127.0.0.1:1/ponte";
const { GET } = await import("../src/app/api/saude/route.ts");

test("saude responde erro 503 quando o banco nao responde", async () => {
  const original = console.error;
  const lines = [];
  console.error = (l) => lines.push(String(l));
  try {
    const res = await GET();
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { status: "erro", banco: "erro" });
  } finally {
    console.error = original;
  }
  assert.equal(JSON.parse(lines.at(-1)).area, "saude");
  assert.ok(!lines.join("").includes(":x@"));
});
