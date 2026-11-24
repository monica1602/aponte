// Sobe o build standalone da Ponte com um banco vazio, so para os testes E2E.
// Uso: node e2e/server.mjs <nome> <porta> [aprovacao]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const [name, port, mode] = process.argv.slice(2);
const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next/standalone");
if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Rode npm run build antes de npm run test:e2e.");
  process.exit(1);
}
fs.cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
fs.cpSync(path.join(root, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });

const env = { ...process.env };
for (const key of ["DATABASE_URL", "POSTGRES_URL", "NEON_DATABASE_URL", "DATABASE_PATH", "VERCEL", "REQUIRE_APPROVAL", "ADMIN_2FA_RESET", "CERTIFICATE_SIGNING_P12", "CERTIFICATE_SIGNING_PASSWORD", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) delete env[key];

const pgUrl = process.env.E2E_DATABASE_URL;
if (pgUrl) {
  const base = new URL(pgUrl);
  const target = new URL(pgUrl);
  target.pathname = `${base.pathname}_${name}`;
  const admin = new URL(pgUrl);
  admin.pathname = "/postgres";
  const dbName = target.pathname.slice(1);
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  env.DATABASE_URL = target.toString();
} else {
  const dir = path.join(root, "e2e/.data");
  fs.mkdirSync(dir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(path.join(dir, `${name}.db${suffix}`), { force: true });
  env.DATABASE_PATH = path.join(dir, `${name}.db`);
}

Object.assign(env, {
  NODE_ENV: "production",
  PORT: port,
  HOSTNAME: "127.0.0.1",
  BASE_URL: `http://localhost:${port}`,
  RESEND_API_KEY: "e2e",
  RESEND_API_URL: `http://127.0.0.1:${process.env.E2E_MAIL_PORT || 3910}/emails`,
  ADMIN_EMAIL: "admin@e2e.test",
  ADMIN_PASSWORD: "Admin@e2e2026",
  ADMIN_ALERT_EMAIL: "alertas@e2e.test",
  CRON_SECRET: "e2e-cron",
  SEED_DEMO: "1",
});
if (mode === "aprovacao") env.REQUIRE_APPROVAL = "1";

const child = spawn(process.execPath, ["server.js"], { cwd: standalone, env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
