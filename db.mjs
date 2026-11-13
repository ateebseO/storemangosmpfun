// Thin adapter that gives the API a small "prepare().bind().all()/first()/run()" + "batch()" interface over Turso (libSQL).
import { createClient } from "@libsql/client/web";
import { SCHEMA, SCHEMA_VERSION } from "./schema.mjs";

let client;
export function openDb(env) {
  if (!env.TURSO_DATABASE_URL || !env.TURSO_AUTH_TOKEN) return null;
  client ||= createClient({ url: env.TURSO_DATABASE_URL, authToken: env.TURSO_AUTH_TOKEN });
  const c = client;
  const rows = r => r.rows.map(row => Object.fromEntries(r.columns.map((col, i) => [col, row[i]])));
  class Stmt {
    constructor(sql) { this.sql = sql; this.args = []; }
    bind(...a) { this.args = a; return this; }
    async all() { return { results: rows(await c.execute({ sql: this.sql, args: this.args })) }; }
    async first() { return rows(await c.execute({ sql: this.sql, args: this.args }))[0] ?? null; }
    async run() { const r = await c.execute({ sql: this.sql, args: this.args }); return { meta: { changes: r.rowsAffected } }; }
  }
  return { prepare: sql => new Stmt(sql), batch: list => c.batch(list.map(s => ({ sql: s.sql, args: s.args })), "write") };
}

let ready;
/** Creates all tables on first use (safe to repeat). Beginners never have to run SQL by hand. */
export function ensureSchema(DB) {
  return ready ||= (async () => {
    let v = 0;
    try { const r = await DB.prepare("SELECT v FROM schema_version LIMIT 1").first(); v = r ? Number(r.v) : 0; } catch { v = 0; }
    if (v >= SCHEMA_VERSION) return;
    await DB.batch(SCHEMA.map(s => DB.prepare(s)));
    await DB.batch([DB.prepare("DELETE FROM schema_version"), DB.prepare("INSERT INTO schema_version(v) VALUES(?1)").bind(SCHEMA_VERSION)]);
  })().catch(e => { ready = null; throw e; });
}
