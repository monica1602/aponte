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

test("previa usa so o banco ponte-preview; sem ele, banco temporario e nunca o real", async () => {
  const { postgresUrl, isTemporaryDatabase } = await import("../src/lib/sql.ts");
  const keys = ["VERCEL", "VERCEL_ENV", "DATABASE_URL", "STORAGE_DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL", "DATABASE_PATH"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  try {
    for (const k of keys) delete process.env[k];
    process.env.VERCEL = "1";
    process.env.DATABASE_URL = "postgres://real";
    process.env.STORAGE_DATABASE_URL = "postgres://previa";
    process.env.VERCEL_ENV = "production";
    assert.equal(postgresUrl(), "postgres://real");
    process.env.VERCEL_ENV = "preview";
    assert.equal(postgresUrl(), "postgres://previa");
    delete process.env.STORAGE_DATABASE_URL;
    assert.equal(postgresUrl(), undefined);
    assert.equal(isTemporaryDatabase(), true);
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
});

test("na producao os links usam o endereco fixo, mesmo com cabecalhos forjados", async () => {
  const { siteUrlFrom, fixedSiteUrl } = await import("../src/lib/environment.ts");
  const keys = ["BASE_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL"];
  const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const forged = { "x-forwarded-host": "evil.example", host: "evil.example", "x-forwarded-proto": "http" };
  const get = (name) => forged[name];
  try {
    for (const k of keys) delete process.env[k];
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "aponte-eight.vercel.app";
    assert.equal(siteUrlFrom(get), "https://aponte-eight.vercel.app");
    assert.equal(fixedSiteUrl(), "https://aponte-eight.vercel.app");
    process.env.BASE_URL = "https://ponte.exemplo/";
    assert.equal(siteUrlFrom(get), "https://ponte.exemplo");
    delete process.env.BASE_URL;
    process.env.VERCEL_ENV = "preview";
    assert.equal(fixedSiteUrl(), null);
    assert.equal(siteUrlFrom((name) => ({ host: "aponte-git-x.vercel.app" })[name]), "https://aponte-git-x.vercel.app");
    delete process.env.VERCEL_ENV;
    assert.equal(siteUrlFrom(() => undefined), "http://localhost:3000");
  } finally {
    for (const k of keys) {
      if (before[k] === undefined) delete process.env[k];
      else process.env[k] = before[k];
    }
  }
});
