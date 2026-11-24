// Backup e conferencia do banco PostgreSQL (usado por .github/workflows/backup.yml).
//   node scripts/db-backup.mjs version          -> versao principal do servidor (BACKUP_DATABASE_URL)
//   node scripts/db-backup.mjs dump <pasta>     -> ponte.dump + counts.json do mesmo instante
//   node scripts/db-backup.mjs check <counts>   -> compara o banco restaurado (RESTORE_DATABASE_URL)
// Nenhum dado nem endereco de banco e impresso: so nomes de tabelas e contagens.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

/** O pg_dump precisa da conexao direta: no Neon, o endereco "-pooler" passa pelo PgBouncer. */
export function directUrl(url) {
  const u = new URL(url);
  u.hostname = u.hostname.replace("-pooler.", ".");
  return u.toString();
}

const TABLES = `SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`;

async function countTables(client) {
  const counts = {};
  for (const { table_name } of (await client.query(TABLES)).rows) {
    const r = await client.query(`SELECT COUNT(*)::bigint AS n FROM "${table_name.replaceAll('"', '""')}"`);
    counts[table_name] = Number(r.rows[0].n);
  }
  return counts;
}

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variavel ${name} nao definida.`);
  return v;
}

async function version() {
  const client = new pg.Client({ connectionString: directUrl(env("BACKUP_DATABASE_URL")) });
  await client.connect();
  const { rows } = await client.query("SHOW server_version_num");
  await client.end();
  console.log(Math.floor(Number(rows[0].server_version_num) / 10000));
}

/** Conta as tabelas e roda o pg_dump na mesma foto do banco (snapshot exportado). */
async function dump(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const url = directUrl(env("BACKUP_DATABASE_URL"));
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const snapshot = (await client.query("SELECT pg_export_snapshot() AS s")).rows[0].s;
  const counts = await countTables(client);
  const version = (await client.query("SHOW server_version_num")).rows[0].server_version_num;
  const code = await new Promise((resolve) => {
    const p = spawn(
      "pg_dump",
      ["--format=custom", "--no-owner", "--no-acl", `--snapshot=${snapshot}`, "--file", path.join(dir, "ponte.dump"), "--dbname", url],
      { stdio: ["ignore", "inherit", "inherit"] }
    );
    p.on("close", resolve);
  });
  await client.query("COMMIT");
  await client.end();
  if (code !== 0) throw new Error(`pg_dump terminou com codigo ${code}.`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  fs.writeFileSync(path.join(dir, "counts.json"), JSON.stringify({ created_at: new Date().toISOString(), server_version_num: version, tables: counts }, null, 2));
  console.log(`Backup: ${Object.keys(counts).length} tabelas, ${total} registros.`);
}

async function check(countsFile) {
  const expected = JSON.parse(fs.readFileSync(countsFile, "utf8")).tables;
  const client = new pg.Client({ connectionString: env("RESTORE_DATABASE_URL") });
  await client.connect();
  const got = await countTables(client);
  await client.end();
  const names = [...new Set([...Object.keys(expected), ...Object.keys(got)])].sort();
  let errors = 0;
  for (const t of names) {
    const ok = expected[t] === got[t];
    if (!ok) errors++;
    console.log(`${ok ? "ok  " : "ERRO"} ${t}: backup ${expected[t] ?? "ausente"}, restaurado ${got[t] ?? "ausente"}`);
  }
  if (!names.length) throw new Error("Nenhuma tabela encontrada.");
  if (errors) throw new Error(`${errors} tabela(s) diferentes do backup.`);
  console.log(`Recuperacao conferida: ${names.length} tabelas iguais ao backup.`);
}

const [cmd, arg] = process.argv.slice(2);
const run = { version, dump: () => dump(arg), check: () => check(arg) }[cmd];
if (run) {
  run().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
