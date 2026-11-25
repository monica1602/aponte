// Remove do banco as 7 contas de demonstracao e o que pertence a elas (usado no site real, com SEED_DEMO=0).
//   node scripts/remover-demo.mjs levantamento  -> so le o banco e mostra o que seria removido
//   node scripts/remover-demo.mjs remover       -> remove numa transacao unica; recusa se houver ligacao com pessoas reais
// Banco: DATABASE_URL (PostgreSQL) ou DATABASE_PATH (SQLite). So imprime nomes de tabelas e contagens.
import pg from "pg";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { directUrl } from "./db-backup.mjs";

export const DEMO_EMAILS = ["ana@ponte.dev", "carlos@ponte.dev", "rita@ponte.dev", "contato@techcorp.dev", "joao@email.com", "maria@email.com", "pedro@email.com"];
// Colunas que guardam uma pessoa sem chave estrangeira declarada.
const LOOSE_USER_COLS = { certificates: ["revoked_by"], company_meetings: ["proposed_by"], mentorship_meetings: ["proposed_by"], mentorships: ["completed_by"] };
// Historico da administracao: continua, so sem a pessoa.
const KEEP_HISTORY = new Set(["audit_log"]);

export async function openDb({ url, file } = {}) {
  if (url) {
    const client = new pg.Client({ connectionString: directUrl(url) });
    await client.connect();
    const q = (sql) => { let n = 0; return sql.replace(/\?/g, () => `$${++n}`); };
    return {
      dialect: "postgres",
      all: async (sql, params = []) => (await client.query(q(sql), params)).rows,
      run: async (sql, params = []) => (await client.query(q(sql), params)).rowCount,
      begin: (readOnly) => client.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN ISOLATION LEVEL SERIALIZABLE"),
      commit: () => client.query("COMMIT"),
      rollback: () => client.query("ROLLBACK"),
      close: () => client.end(),
    };
  }
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  return {
    dialect: "sqlite",
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    run: async (sql, params = []) => Number(db.prepare(sql).run(...params).changes),
    begin: async () => db.exec("BEGIN IMMEDIATE"),
    commit: async () => db.exec("COMMIT"),
    rollback: async () => db.exec("ROLLBACK"),
    close: async () => db.close(),
  };
}

const ident = (name) => `"${String(name).replaceAll('"', '""')}"`;
const marks = (list) => list.map(() => "?").join(",");

async function schema(db) {
  const tables = {};
  const fks = [];
  if (db.dialect === "postgres") {
    for (const r of await db.all("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE')"))
      (tables[r.table_name] ??= new Set()).add(r.column_name);
    for (const r of await db.all(`SELECT cl.relname AS child, a.attname AS col, pcl.relname AS parent, c.confdeltype AS action
      FROM pg_constraint c JOIN pg_class cl ON cl.oid = c.conrelid JOIN pg_class pcl ON pcl.oid = c.confrelid
      JOIN pg_namespace n ON n.oid = c.connamespace JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
      WHERE c.contype = 'f' AND n.nspname = 'public'`))
      fks.push({ child: r.child, col: r.col, parent: r.parent, action: { c: "cascade", n: "setnull" }[r.action] ?? "other" });
  } else {
    for (const { name } of await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
      tables[name] = new Set((await db.all(`PRAGMA table_info(${ident(name)})`)).map((c) => c.name));
      for (const f of await db.all(`PRAGMA foreign_key_list(${ident(name)})`))
        fks.push({ child: name, col: f.from, parent: f.table, action: { CASCADE: "cascade", "SET NULL": "setnull" }[f.on_delete] ?? "other" });
    }
  }
  const userCols = {};
  for (const t of Object.keys(tables)) {
    userCols[t] = [...new Set([...fks.filter((f) => f.child === t && f.parent === "users").map((f) => f.col), ...(LOOSE_USER_COLS[t] ?? []).filter((c) => tables[t].has(c))])];
  }
  return { tables, fks, userCols };
}

/** Calcula o que sai e o que fica, sem alterar nada. */
export async function survey(db) {
  const { tables, fks, userCols } = await schema(db);
  const hasId = (t) => tables[t]?.has("id");
  const demoIds = (await db.all(`SELECT id FROM users WHERE email IN (${marks(DEMO_EMAILS)})`, DEMO_EMAILS)).map((r) => Number(r.id));
  const demo = new Set(demoIds);
  const del = new Map([["users", new Set(demoIds)]]);
  const ids = (t) => [...(del.get(t) ?? [])];
  const add = (t, list) => { const s = del.get(t) ?? new Set(); const before = s.size; for (const r of list) s.add(Number(r.id)); del.set(t, s); return s.size > before; };
  const realRef = (t, row) => userCols[t].some((c) => row[c] != null && !demo.has(Number(row[c])));

  for (let changed = demoIds.length > 0; changed; ) {
    changed = false;
    for (const f of fks) {
      if (f.action !== "cascade" || !hasId(f.child) || !ids(f.parent).length) continue;
      if (add(f.child, await db.all(`SELECT id FROM ${ident(f.child)} WHERE ${ident(f.col)} IN (${marks(ids(f.parent))})`, ids(f.parent)))) changed = true;
    }
    // Registros que so ficariam sem dono (ex.: conversa entre 2 contas de demonstracao) saem junto.
    for (const f of fks) {
      if (f.action !== "setnull" || KEEP_HISTORY.has(f.child) || !hasId(f.child) || !ids(f.parent).length) continue;
      const rows = await db.all(`SELECT * FROM ${ident(f.child)} WHERE ${ident(f.col)} IN (${marks(ids(f.parent))})`, ids(f.parent));
      const orphans = rows.filter((r) => !del.get(f.child)?.has(Number(r.id)) && !realRef(f.child, r) && userCols[f.child].some((c) => demo.has(Number(r[c]))));
      if (add(f.child, orphans)) changed = true;
    }
  }

  const removed = {};
  const nulled = {};
  const links = {};
  const link = (t, n) => { if (n) links[t] = (links[t] ?? 0) + n; };
  for (const t of Object.keys(tables).sort()) {
    if (hasId(t)) {
      if (!ids(t).length) continue;
      removed[t] = ids(t).length;
      if (userCols[t].length) link(t, (await db.all(`SELECT * FROM ${ident(t)} WHERE id IN (${marks(ids(t))})`, ids(t))).filter((r) => realRef(t, r)).length);
    } else {
      const own = fks.filter((f) => f.child === t && f.action === "cascade" && ids(f.parent).length);
      if (!own.length) continue;
      const rows = await db.all(`SELECT * FROM ${ident(t)} WHERE ${own.map((f) => `${ident(f.col)} IN (${marks(ids(f.parent))})`).join(" OR ")}`, own.flatMap((f) => ids(f.parent)));
      if (rows.length) removed[t] = rows.length;
      link(t, rows.filter((r) => realRef(t, r)).length);
    }
  }
  for (const f of fks) {
    if (f.action !== "setnull" || !ids(f.parent).length) continue;
    const keep = ids(f.child);
    const rows = await db.all(`SELECT * FROM ${ident(f.child)} WHERE ${ident(f.col)} IN (${marks(ids(f.parent))})${keep.length ? ` AND id NOT IN (${marks(keep)})` : ""}`, [...ids(f.parent), ...keep]);
    if (!rows.length) continue;
    nulled[`${f.child}.${f.col}`] = rows.length;
    if (!KEEP_HISTORY.has(f.child)) link(f.child, rows.length);
  }
  for (const [t, cols] of Object.entries(userCols)) {
    const loose = (LOOSE_USER_COLS[t] ?? []).filter((c) => cols.includes(c));
    if (!loose.length || !demoIds.length) continue;
    const keep = ids(t);
    const rows = await db.all(`SELECT id FROM ${ident(t)} WHERE (${loose.map((c) => `${ident(c)} IN (${marks(demoIds)})`).join(" OR ")})${keep.length ? ` AND id NOT IN (${marks(keep)})` : ""}`, [...loose.flatMap(() => demoIds), ...keep]);
    link(t, rows.length);
  }
  const counts = {};
  for (const t of Object.keys(tables).sort()) counts[t] = Number((await db.all(`SELECT COUNT(*) AS n FROM ${ident(t)}`))[0].n);
  return { found: demoIds.length, removed, nulled, links, counts, plan: Object.fromEntries([...del].map(([t, s]) => [t, [...s]])) };
}

/** Remove numa transacao. Se houver ligacao com pessoas reais, ou se algo diferente do previsto mudar, desfaz tudo. */
export async function remove(db) {
  await db.begin(false);
  try {
    const s = await survey(db);
    const totalLinks = Object.values(s.links).reduce((a, b) => a + b, 0);
    if (totalLinks) throw new Error(`Encontrei ${totalLinks} ligacao(oes) com pessoas reais. Nada foi removido.`);
    for (const [t, list] of Object.entries(s.plan)) {
      if (t === "users" || !list.length) continue;
      await db.run(`DELETE FROM ${ident(t)} WHERE id IN (${marks(list)})`, list);
    }
    if (s.plan.users?.length) await db.run(`DELETE FROM users WHERE id IN (${marks(s.plan.users)})`, s.plan.users);
    const after = await survey(db);
    for (const [t, n] of Object.entries(s.counts)) {
      const expected = n - (s.removed[t] ?? 0);
      if (after.counts[t] !== expected) throw new Error(`Tabela ${t}: esperava ${expected} registros, ficaram ${after.counts[t]}. Nada foi removido.`);
    }
    if (after.found) throw new Error("Ainda ha contas de demonstracao. Nada foi removido.");
    await db.commit();
    return s;
  } catch (e) {
    await db.rollback();
    throw e;
  }
}

function print(s, title) {
  console.log(title);
  console.log(`Contas de demonstracao encontradas: ${s.found} de ${DEMO_EMAILS.length}`);
  console.log("Registros removidos por tabela:");
  for (const [t, n] of Object.entries(s.removed)) console.log(`  ${t}: ${n}`);
  console.log("Campos que ficam vazios em registros que continuam:");
  for (const [c, n] of Object.entries(s.nulled)) console.log(`  ${c}: ${n}`);
  if (!Object.keys(s.nulled).length) console.log("  nenhum");
  console.log("Ligacoes com pessoas reais:");
  for (const [t, n] of Object.entries(s.links)) console.log(`  ${t}: ${n}`);
  if (!Object.keys(s.links).length) console.log("  nenhuma");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const cmd = process.argv[2];
  const url = process.env.DATABASE_URL;
  const file = process.env.DATABASE_PATH;
  (async () => {
    if (!["levantamento", "remover"].includes(cmd)) throw new Error("Use: levantamento ou remover");
    if (!url && !file) throw new Error("Defina DATABASE_URL ou DATABASE_PATH.");
    const db = await openDb({ url, file });
    try {
      if (cmd === "levantamento") {
        await db.begin(true);
        const s = await survey(db);
        await db.rollback();
        print(s, "LEVANTAMENTO (nada foi alterado)");
      } else {
        print(await remove(db), "REMOCAO CONCLUIDA");
      }
    } finally {
      await db.close();
    }
  })().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}
