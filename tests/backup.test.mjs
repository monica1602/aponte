import { test } from "node:test";
import assert from "node:assert/strict";
import { directUrl } from "../scripts/db-backup.mjs";

test("backup usa a conexao direta do Neon, sem o pooler", () => {
  assert.equal(
    directUrl("postgresql://u:p@ep-abc-123-pooler.sa-east-1.aws.neon.tech/neondb?sslmode=require"),
    "postgresql://u:p@ep-abc-123.sa-east-1.aws.neon.tech/neondb?sslmode=require"
  );
  assert.equal(directUrl("postgres://u:p@localhost:5432/ponte"), "postgres://u:p@localhost:5432/ponte");
});
