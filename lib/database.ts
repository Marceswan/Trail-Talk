import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, type PoolClient, types } from 'pg';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';

// Millisecond timestamps and aggregate counts are safe integers in this app.
types.setTypeParser(20, value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe range');
  return number;
});
type Row = Record<string, string | number | null>;
type Context = { client?: PoolClient; sqlite?: DatabaseSync };
const context = new AsyncLocalStorage<Context>();
const globalState = globalThis as unknown as { trailtalkPool?: Pool };
let sqlite: (() => DatabaseSync) | undefined;
let queue: Promise<unknown> = Promise.resolve();
export function useSQLite(factory: () => DatabaseSync) { sqlite = factory; }
export const isPostgres = () => !process.env.DATABASE_PATH && Boolean(process.env.DATABASE_URL);
function pool() {
  return globalState.trailtalkPool ||= new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000, allowExitOnIdle: true, enableChannelBinding: true });
}
function serial<T>(run: () => T | Promise<T>): Promise<T> {
  const next = queue.then(run, run);
  queue = next.catch(() => {});
  return next;
}
// Only placeholders outside SQL string literals are rewritten.
export function postgresSQL(sql: string) {
  let index = 0;
  return sql.replace(/'(?:''|[^'])*'|\?/g, token => token === '?' ? `$${++index}` : token);
}
async function query(sql: string, values: SQLInputValue[], mode: 'all'|'get'|'run') {
  if (isPostgres()) {
    const result = await (context.getStore()?.client || pool()).query(postgresSQL(sql), values);
    for (const row of result.rows) for (const key of Object.keys(row)) if (typeof row[key] === 'boolean') row[key] = Number(row[key]);
    return mode === 'all' ? result.rows : mode === 'get' ? result.rows[0] : { changes: result.rowCount || 0, lastInsertRowid: result.rows[0]?.id };
  }
  const execute = () => {
    const d = context.getStore()?.sqlite || sqlite!();
    const statement = d.prepare(sql);
    return mode === 'all' ? statement.all(...values) : mode === 'get' ? statement.get(...values) : statement.run(...values);
  };
  return context.getStore()?.sqlite ? execute() : serial(execute);
}
export const database = {
  prepare(sql: string) {
    return {
      all: (...values: SQLInputValue[]) => query(sql, values, 'all') as Promise<Row[]>,
      get: (...values: SQLInputValue[]) => query(sql, values, 'get') as Promise<Row | undefined>,
      run: (...values: SQLInputValue[]) => query(sql, values, 'run') as Promise<{ changes: number | bigint; lastInsertRowid: number | bigint }>,
    };
  },
};
export async function transaction<T>(run: () => Promise<T>): Promise<T> {
  if (context.getStore()) return run();
  if (isPostgres()) {
    const client = await pool().connect();
    try {
      await client.query('BEGIN');
      // Match SQLite's serialized write transactions across function instances.
      // Credential recovery, session creation, and moderation remain atomic.
      await client.query('SELECT pg_advisory_xact_lock(716284103)');
      const value = await context.run({ client }, run);
      await client.query('COMMIT');
      return value;
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  return serial(async () => {
    const d = sqlite!();
    d.exec('BEGIN IMMEDIATE');
    try {
      const value = await context.run({ sqlite: d }, run);
      d.exec('COMMIT');
      return value;
    } catch (error) { d.exec('ROLLBACK'); throw error; }
  });
}
