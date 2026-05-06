/**
 * Database connection for the whole app.
 *
 * We use SQLite via Node's built-in node:sqlite (DatabaseSync). The database lives in a single file
 * on disk (`data/simplesql.db` relative to project root), so no separate database server is required.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DatabaseSync } from "node:sqlite";

// Path to the DB file relative to project root — change here if you want a different filename or folder.
const SQLITE_RELATIVE_PATH = "data/simplesql.db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

/**
 * Absolute filesystem path used to open SQLite.
 */
export function getSqlitePath() {
  const p = SQLITE_RELATIVE_PATH;
  return path.isAbsolute(p) ? p : path.resolve(projectRoot, p);
}

let dbInstance;

export function getDb() {
  if (!dbInstance) {
    const file = getSqlitePath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    dbInstance = new DatabaseSync(file);
    dbInstance.exec("PRAGMA journal_mode = WAL;");
  }
  return dbInstance;
}
