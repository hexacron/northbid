// Local SQLite cache of the source files. Each file is fetched with a
// conditional request and loaded atomically; the database is disposable and
// is rebuilt whenever the schema version changes.

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { records } from './csv.js';
import { FILES, TABLES } from './datasets.js';
import { download } from './download.js';

const SCHEMA_VERSION = 1;

/** Cache directory: explicit override, then the plugin data dir, then the OS cache dir. */
export function defaultDataDir(env = process.env) {
  if (env.NORTHBID_DATA_DIR) return env.NORTHBID_DATA_DIR;
  if (env.CLAUDE_PLUGIN_DATA) return env.CLAUDE_PLUGIN_DATA;
  if (process.platform === 'win32' && env.LOCALAPPDATA) return join(env.LOCALAPPDATA, 'northbid');
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'northbid');
  return join(env.XDG_CACHE_HOME || join(homedir(), '.cache'), 'northbid');
}

export class Store {
  /**
   * @param {string} dir cache directory, or ':memory:'
   * @param {{ offline?: boolean, userAgent?: string }} [options]
   */
  constructor(dir, { offline = false, userAgent = 'northbid' } = {}) {
    if (dir === ':memory:') {
      this.path = dir;
    } else {
      mkdirSync(dir, { recursive: true });
      this.path = join(dir, 'northbid.sqlite');
    }
    this.offline = offline;
    this.userAgent = userAgent;
    this.inflight = new Map();
    this.db = new DatabaseSync(this.path);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000;');
    if (this.db.prepare('PRAGMA user_version').get().user_version !== SCHEMA_VERSION) this.#createSchema();
  }

  #createSchema() {
    const sql = ['DROP TABLE IF EXISTS files'];
    for (const [name, t] of Object.entries(TABLES)) {
      sql.push(`DROP TABLE IF EXISTS ${name}_fts`, `DROP TABLE IF EXISTS ${name}`);
      const cols = t.columns.map((c) => `${c} TEXT NOT NULL${c === t.primaryKey ? ' PRIMARY KEY' : ''}`);
      sql.push(`CREATE TABLE ${name} (${cols.join(', ')}, source TEXT NOT NULL)`);
      for (const c of t.indexes) sql.push(`CREATE INDEX ${name}_${c} ON ${name} (${c})`);
      sql.push(
        `CREATE VIRTUAL TABLE ${name}_fts USING fts5(${t.fts.join(', ')}, content='${name}', ` +
          `content_rowid='rowid', tokenize='unicode61 remove_diacritics 2')`,
      );
    }
    sql.push(
      `CREATE TABLE files (id TEXT PRIMARY KEY, etag TEXT, source_updated TEXT, fetched_at TEXT NOT NULL,
        checked_at TEXT NOT NULL, row_count INTEGER NOT NULL)`,
      `PRAGMA user_version = ${SCHEMA_VERSION}`,
    );
    this.db.exec(sql.join(';\n'));
  }

  #file(id) {
    return this.db.prepare('SELECT * FROM files WHERE id = ?').get(id);
  }

  /**
   * Replaces everything previously loaded from `file` with `rows`.
   * @param {(typeof FILES)[number]} file
   * @param {Record<string, string>[]} rows
   * @param {{ etag?: string | null, sourceUpdated?: string | null }} [info]
   */
  load(file, rows, { etag = null, sourceUpdated = null } = {}) {
    const { columns } = TABLES[file.table];
    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT OR ${file.onConflict} INTO ${file.table} (${columns.join(', ')}, source)
       VALUES (${columns.map(() => '?').join(', ')}, ?)`,
    );
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`DELETE FROM ${file.table} WHERE source = ?`).run(file.id);
      for (const row of rows) insert.run(...columns.map((c) => row[c] ?? ''), file.id);
      this.db.exec(`INSERT INTO ${file.table}_fts(${file.table}_fts) VALUES('rebuild')`);
      this.db
        .prepare(
          `INSERT INTO files (id, etag, source_updated, fetched_at, checked_at, row_count) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET etag = excluded.etag, source_updated = excluded.source_updated,
             fetched_at = excluded.fetched_at, checked_at = excluded.checked_at, row_count = excluded.row_count`,
        )
        .run(file.id, etag, sourceUpdated, now, now, rows.length);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async #download(file) {
    const known = this.#file(file.id);
    const headers = { 'user-agent': this.userAgent };
    if (known?.etag) headers['if-none-match'] = known.etag;
    if (known?.source_updated) headers['if-modified-since'] = new Date(known.source_updated).toUTCString();
    const res = await download(file.url, headers);
    if (res.statusCode === 304) {
      res.resume();
      this.db.prepare('UPDATE files SET checked_at = ? WHERE id = ?').run(new Date().toISOString(), file.id);
      return;
    }
    if (res.statusCode !== 200) {
      res.resume();
      throw new Error(`HTTP ${res.statusCode}`);
    }
    const rows = [];
    for await (const row of file.rows(records(res.setEncoding('utf8')))) rows.push(row);
    // An empty required file is an upstream fault; keep what we have.
    if (rows.length === 0 && file.required) throw new Error('the source file contained no rows');
    const modified = Date.parse(res.headers['last-modified'] ?? '');
    this.load(file, rows, {
      etag: res.headers.etag ?? null,
      sourceUpdated: Number.isNaN(modified) ? null : new Date(modified).toISOString().replace('.000Z', 'Z'),
    });
  }

  /**
   * Brings the files behind `table` up to date and returns warnings for
   * anything that could not be refreshed. Throws only when a required file
   * has never been loaded and cannot be fetched.
   * @param {string | null} table null for every table
   * @param {{ force?: boolean }} [options] force ignores the per-file TTL
   * @returns {Promise<string[]>}
   */
  async refresh(table = null, { force = false } = {}) {
    const warnings = [];
    const due = FILES.filter((f) => table === null || f.table === table);
    await Promise.all(
      due.map(async (file) => {
        const known = this.#file(file.id);
        if (this.offline) {
          if (!known && file.required) {
            throw new Error(`${file.label} has not been downloaded yet and NORTHBID_OFFLINE is set.`);
          }
          return;
        }
        if (!force && known && Date.now() - Date.parse(known.checked_at) < file.ttl) return;
        let job = this.inflight.get(file.id);
        if (!job) {
          job = this.#download(file).finally(() => this.inflight.delete(file.id));
          this.inflight.set(file.id, job);
        }
        try {
          await job;
        } catch (err) {
          const reason = err.name === 'TimeoutError' ? 'the request timed out' : err.cause?.message || err.message;
          if (!known && file.required) {
            throw new Error(
              `Could not download ${file.label} from ${file.url}: ${reason}. ` +
                'Check the network connection and call refresh_data to retry.',
            );
          }
          warnings.push(
            known
              ? `Could not refresh ${file.label} (${reason}); showing data fetched ${known.fetched_at}.`
              : `${file.label} is unavailable (${reason}).`,
          );
        }
      }),
    );
    return warnings;
  }

  /** When the source last published the required file behind `table`. */
  sourceUpdated(table) {
    const file = FILES.find((f) => f.table === table && f.required);
    return this.#file(file.id)?.source_updated ?? null;
  }

  status() {
    return {
      database: this.path,
      offline: this.offline,
      files: FILES.map((f) => {
        const known = this.#file(f.id);
        return {
          id: f.id,
          label: f.label,
          url: f.url,
          table: f.table,
          loaded: Boolean(known),
          rows_in_file: known?.row_count ?? 0,
          source_updated: known?.source_updated ?? null,
          fetched_at: known?.fetched_at ?? null,
          checked_at: known?.checked_at ?? null,
        };
      }),
      tables: Object.fromEntries(
        Object.keys(TABLES).map((t) => [t, this.db.prepare(`SELECT count(*) AS n FROM ${t}`).get().n]),
      ),
    };
  }

  close() {
    this.db.close();
  }
}
