/**
 * SimpleSql — web server (Express).
 *
 * Serves static files from /public and JSON APIs under /api.
 * The browser pages call these APIs with fetch(); this file does not render HTML templates.
 * The Users page mainly uses GET (list everyone), POST (add), PUT (save changes), and DELETE.
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { getDb } from "./lib/db.js";
import { registerExcelUploadRoutes } from "./lib/excel-upload.js";
import { registerExploreRoutes } from "./lib/explore.js";

/**
 * SQLite reports duplicate emails differently depending on Node version / driver.
 * We treat both shapes as "unique constraint on email" so we can return HTTP 409.
 */
function isUniqueEmailError(e) {
  return (
    e.code === "SQLITE_CONSTRAINT_UNIQUE" ||
    (e.code === "ERR_SQLITE_ERROR" && String(e.message).includes("UNIQUE constraint"))
  );
}

// In ES modules there is no __dirname; this is the standard way to get the folder of the current file.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
// TCP port for the web server — change here if 3000 is already in use on your machine.
const port = 3000;

// Parse JSON request bodies (e.g. POST { "name": "...", "email": "..." }) into req.body.
// Uploads send Excel files as base64 JSON, so this page needs a larger body limit.
app.use(express.json({ limit: "25mb" }));
// Serve index.html, css/, etc. from the public/ folder at the site root (e.g. /index.html).
app.use(express.static(path.join(__dirname, "public")));

// --- Users API (the webpage uses list + add + edit + delete) ---

// List every row in the users table.
app.get("/api/users", (_req, res) => {
  try {
    const db = getDb();
    // prepare() compiles SQL once; ? placeholders are filled safely when you call .all() / .run().
    const rows = db
      .prepare("SELECT id, name, email, created_at FROM users ORDER BY id")
      .all();
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Get one user by primary key. :id in the path becomes req.params.id.
app.get("/api/users/:id", (req, res) => {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
      .get(req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

// Create a new user. 201 = "Created". Body must be JSON with name and email.
app.post("/api/users", (req, res) => {
  try {
    const { name, email } = req.body ?? {};
    if (!name || !email) {
      return res.status(400).json({ error: "name and email required" });
    }
    const db = getDb();
    const info = db
      .prepare("INSERT INTO users (name, email) VALUES (?, ?)")
      .run(String(name).trim(), String(email).trim());
    // After INSERT, lastInsertRowid is the new row's id; we SELECT it back to return full row (including created_at).
    const row = db
      .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
      .get(Number(info.lastInsertRowid));
    res.status(201).json(row);
  } catch (e) {
    if (isUniqueEmailError(e)) {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: String(e.message) });
  }
});

// Replace name/email for an existing id. 404 if that id does not exist.
app.put("/api/users/:id", (req, res) => {
  try {
    const { name, email } = req.body ?? {};
    if (!name || !email) {
      return res.status(400).json({ error: "name and email required" });
    }
    const db = getDb();
    const info = db
      .prepare("UPDATE users SET name = ?, email = ? WHERE id = ?")
      .run(String(name).trim(), String(email).trim(), req.params.id);
    if (Number(info.changes) === 0) return res.status(404).json({ error: "Not found" });
    const row = db
      .prepare("SELECT id, name, email, created_at FROM users WHERE id = ?")
      .get(req.params.id);
    res.json(row);
  } catch (e) {
    if (isUniqueEmailError(e)) {
      return res.status(409).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: String(e.message) });
  }
});

// Remove a row by id. 204 = success with no response body.
app.delete("/api/users/:id", (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
    if (Number(info.changes) === 0) return res.status(404).json({ error: "Not found" });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

registerExcelUploadRoutes(app);
registerExploreRoutes(app);

// Download the current database schema as a plain-text SQL file.
app.get("/api/schema", (_req, res) => {
  try {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY type, name"
      )
      .all();
    const schema = rows.map((row) => `${row.sql};`).join("\n") + "\n";

    res.attachment("schema.sql");
    res.type("text/plain").send(schema);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});

/**
 * True if `sql` has something to run after ignoring whitespace and comments.
 * Stops a trailing `-- note` (with no real statement) from becoming a failed prepare().
 */
function sqlHasExecutableContent(sql) {
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }
    if (inSingle) {
      if (ch === "'" && next === "'") {
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }
    if (inDouble) {
      if (ch === '"' && next === '"') {
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") {
      i += 2;
      inLineComment = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      inBlockComment = true;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      i += 1;
      continue;
    }
    if (!/\s/.test(ch)) return true;
    i += 1;
  }
  return false;
}

/**
 * Split a script into individual statements on `;`.
 * Ignores semicolons inside 'strings', "identifiers", -- line comments, and block comments.
 * Needed because db.prepare() only runs the first statement when several are pasted together.
 */
function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let i = 0;
  let inSingle = false;
  let inDouble = false;
  let inLineComment = false;
  let inBlockComment = false;

  function pushCurrent() {
    const trimmed = current.trim();
    if (trimmed && sqlHasExecutableContent(trimmed)) {
      statements.push(trimmed);
    }
    current = "";
  }

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === "\n") inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === "*" && next === "/") {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (inSingle) {
      current += ch;
      // SQLite escapes a quote inside a string by doubling it: 'O''Brien'
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i += 1;
      continue;
    }

    if (inDouble) {
      current += ch;
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i += 1;
      continue;
    }

    if (ch === "-" && next === "-") {
      current += ch + next;
      i += 2;
      inLineComment = true;
      continue;
    }
    if (ch === "/" && next === "*") {
      current += ch + next;
      i += 2;
      inBlockComment = true;
      continue;
    }
    if (ch === "'") {
      current += ch;
      inSingle = true;
      i += 1;
      continue;
    }
    if (ch === '"') {
      current += ch;
      inDouble = true;
      i += 1;
      continue;
    }
    if (ch === ";") {
      pushCurrent();
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  pushCurrent();
  return statements;
}

/**
 * Run one SQL statement. SELECT/PRAGMA-style queries return rows; INSERT/UPDATE/… return changes.
 * node:sqlite exposes that difference via statement.columns(): non-empty means "this returns a result set".
 */
function runOneSqlStatement(db, sql) {
  const stmt = db.prepare(sql);
  const colInfo = stmt.columns();

  if (colInfo.length > 0) {
    return {
      type: "result",
      columns: colInfo.map((c) => c.name),
      rows: stmt.all(),
    };
  }

  const info = stmt.run();
  return {
    type: "exec",
    affectedRows: Number(info.changes),
    insertId:
      info.lastInsertRowid !== undefined && info.lastInsertRowid !== null
        ? Number(info.lastInsertRowid)
        : undefined,
  };
}

/**
 * Run arbitrary SQL from the SQL console page.
 * INSECURE: never expose this on the public internet — any caller can read or change the whole database.
 *
 * Students often paste CREATE TABLE plus several INSERT INTO lines. We split on `;` and run each
 * statement in order. One statement keeps the old response shape; several return type: "batch".
 */
app.post("/api/sql", (req, res) => {
  try {
    const sql = (req.body?.sql ?? "").trim();
    if (!sql) return res.status(400).json({ error: "sql required" });

    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      return res.status(400).json({ error: "sql required" });
    }

    const db = getDb();
    const results = [];

    for (let i = 0; i < statements.length; i++) {
      try {
        results.push(runOneSqlStatement(db, statements[i]));
      } catch (e) {
        return res.status(400).json({
          error:
            "Statement " +
            (i + 1) +
            " of " +
            statements.length +
            " failed: " +
            String(e.message),
        });
      }
    }

    // Single statement — same JSON shape as before (browse buttons / simple queries).
    if (results.length === 1) {
      return res.json(results[0]);
    }

    res.json({ type: "batch", results });
  } catch (e) {
    res.status(400).json({ error: String(e.message) });
  }
});

// Start listening. If port is busy, see the 'error' handler below.
const server = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Stop the other process or change \`const port = 3000\` near the top of server.js`
    );
  } else {
    console.error(err);
  }
  process.exit(1);
});
