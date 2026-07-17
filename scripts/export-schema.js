/**
 * Export CREATE statements from the SQLite database (no row data).
 *
 * Run: npm run "export sql schema"
 * Writes schema.sql in the project root.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getDb, getSqlitePath } from "../lib/db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "..", "schema.sql");

function main() {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name"
    )
    .all();

  const schema = rows.map((r) => `${r.sql};`).join("\n") + "\n";
  fs.writeFileSync(outPath, schema, "utf8");

  console.log(`SQLite database file: ${getSqlitePath()}`);
  console.log(`Schema written to: ${outPath}`);
  console.log(`(${rows.length} statement(s))`);
}

main();
