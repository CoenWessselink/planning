import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

class D1BoundStatement {
  constructor(owner, sql, values = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1BoundStatement(this.owner, this.sql, values);
  }

  _statement() {
    return this.owner.sqlite.prepare(this.sql);
  }

  async first(column) {
    const row = this._statement().get(...this.values) ?? null;
    if (column == null) return row;
    return row == null ? null : row[column];
  }

  async all() {
    const results = this._statement().all(...this.values);
    return { success: true, results, meta: { changes: 0 } };
  }

  async run() {
    return this.owner._runBound(this);
  }
}

export class D1Sqlite {
  constructor({ filename = ":memory:", failBatchAt = null } = {}) {
    this.sqlite = new DatabaseSync(filename);
    this.failBatchAt = Number.isInteger(failBatchAt) ? failBatchAt : null;
    this.sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = MEMORY;");
  }

  prepare(sql) {
    return new D1BoundStatement(this, String(sql));
  }

  async exec(sql) {
    this.sqlite.exec(String(sql));
    return { success: true };
  }

  _runBound(bound) {
    const result = this.sqlite.prepare(bound.sql).run(...bound.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0)
      },
      changes: Number(result.changes || 0)
    };
  }

  async batch(statements) {
    if (!Array.isArray(statements)) throw new TypeError("batch verwacht een array statements");
    const results = [];
    this.sqlite.exec("BEGIN IMMEDIATE");
    try {
      for (let index = 0; index < statements.length; index += 1) {
        if (!(statements[index] instanceof D1BoundStatement)) throw new TypeError("Ongeldig D1 statement");
        if (this.failBatchAt === index) throw new Error(`INJECTED_BATCH_FAILURE_${index}`);
        results.push(this._runBound(statements[index]));
      }
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      try { this.sqlite.exec("ROLLBACK"); } catch (_) {}
      throw error;
    }
  }

  close() {
    this.sqlite.close();
  }
}

export function applyMigrations(db, rootDir = process.cwd()) {
  const migrationDir = path.join(rootDir, "migrations");
  const files = fs.readdirSync(migrationDir)
    .filter(name => /^\d+.*\.sql$/i.test(name))
    .sort((a, b) => a.localeCompare(b, "en"));
  for (const file of files) db.sqlite.exec(fs.readFileSync(path.join(migrationDir, file), "utf8"));
  return files;
}

export function createMigratedDb(options = {}) {
  const db = new D1Sqlite(options);
  applyMigrations(db);
  return db;
}
