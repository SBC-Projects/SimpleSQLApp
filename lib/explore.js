/**
 * Explore API — powers the /explore.html "summarise a column" page.
 *
 * The browser asks three things in turn:
 *   1. GET  /api/explore/tables                  → list tables in the database.
 *   2. GET  /api/explore/columns?table=NAME      → list columns of one table.
 *   3. POST /api/explore/summary { table, column, method } → run one of a few
 *      simple SQL summaries and return numbers/rows for the page to draw.
 *
 * STUDENT NOTES
 * -------------
 * SQLite (via node:sqlite) lets you bind values with `?` placeholders, but
 * table and column names ARE NOT VALUES — they are part of the SQL itself, so
 * we cannot pass them with `?`. Instead we:
 *   a) check the name only contains plain letters, digits and underscores, and
 *   b) check the table/column actually exists in this database
 *      (sqlite_master / PRAGMA table_info).
 * Both checks together stop someone from sending `users; DROP TABLE users; --`.
 *
 * Each summary method (overview / frequency / numeric_stats / histogram /
 * list_unique) is just a small SQL query. Read each function below and try the
 * SQL on the SQL console page if you want to see how it works.
 */

import { getDb } from "./db.js";

// Methods we know how to run. Keeping this as a constant means the server can
// tell the browser exactly which methods are valid (see /api/explore/methods).
const SUMMARY_METHODS = [
  {
    id: "overview",
    label: "Overview (counts)",
    needsNumeric: false,
    description:
      "How many rows are there in total? How many are filled in vs blank? How many different values appear?",
  },
  {
    id: "frequency",
    label: "Most common values (bar chart)",
    needsNumeric: false,
    description:
      "Group rows by this column and count each group. Useful for text columns like a city or a category name.",
  },
  {
    id: "numeric_stats",
    label: "Numeric statistics (min / max / average / sum)",
    needsNumeric: true,
    description: "Only for number columns. Runs MIN, MAX, AVG and SUM in one SQL query.",
  },
  {
    id: "histogram",
    label: "Histogram (number column split into bins)",
    needsNumeric: true,
    description:
      "Splits the values from MIN to MAX into 10 equal-width bins, then counts how many rows fall in each bin.",
  },
  {
    id: "list_unique",
    label: "List of unique values",
    needsNumeric: false,
    description: "Lists every distinct value in the column (capped to 200 to keep the page readable).",
  },
];

const SUMMARY_METHOD_IDS = new Set(SUMMARY_METHODS.map((m) => m.id));

// SQLite column types are loose: PRAGMA table_info returns whatever was written
// in the CREATE TABLE statement. We treat anything that looks like a number type
// as numeric so MIN/AVG/SUM make sense.
function isNumericType(declaredType) {
  return /INT|REAL|FLOAT|DOUBLE|NUMERIC|DECIMAL/i.test(String(declaredType || ""));
}

// Identifiers are NOT values — they cannot be bound with ?. We restrict to
// the standard "letters, digits, underscores, must not start with a digit"
// pattern before we ever splice them into SQL.
function isSafeIdentifier(name) {
  return typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function quoteIdentifier(name) {
  if (!isSafeIdentifier(name)) {
    throw new Error(`Bad SQL name: ${name}`);
  }
  return `"${name}"`;
}

// Look up the real list of user tables once and check the requested name is
// in it. This is the second line of defence after isSafeIdentifier.
function assertTableExists(db, tableName) {
  if (!isSafeIdentifier(tableName)) {
    throw new Error("Choose a table from the list.");
  }
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  if (!row) {
    throw new Error(`Table not found: ${tableName}`);
  }
}

// Same idea for columns: only allow names that PRAGMA table_info returns.
function getColumnInfo(db, tableName) {
  // PRAGMA can't take ? parameters, but tableName has already been validated
  // by assertTableExists() before we get here.
  return db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all();
}

function assertColumnExists(db, tableName, columnName) {
  if (!isSafeIdentifier(columnName)) {
    throw new Error("Choose a column from the list.");
  }
  const found = getColumnInfo(db, tableName).some((c) => c.name === columnName);
  if (!found) {
    throw new Error(`Column not found in ${tableName}: ${columnName}`);
  }
}

// --- Summary methods ---------------------------------------------------------
// Each function runs ONE small SQL query (or a few) and returns a plain object
// the browser can render. The SQL is shown in the response under `sql` so
// students can see exactly what was executed.

function summarizeOverview(db, tableName, columnName) {
  const tbl = quoteIdentifier(tableName);
  const col = quoteIdentifier(columnName);

  // COUNT(*) counts every row. COUNT(col) skips NULLs. The difference between
  // the two is the number of blank cells in this column.
  const sql = `SELECT
      COUNT(*)              AS total_rows,
      COUNT(${col})         AS filled_rows,
      COUNT(DISTINCT ${col}) AS distinct_values
    FROM ${tbl}`;

  const row = db.prepare(sql).get() || {};
  const totalRows = Number(row.total_rows ?? 0);
  const filledRows = Number(row.filled_rows ?? 0);

  return {
    totalRows,
    filledRows,
    nullRows: totalRows - filledRows,
    distinctValues: Number(row.distinct_values ?? 0),
    sql,
  };
}

function summarizeFrequency(db, tableName, columnName) {
  const tbl = quoteIdentifier(tableName);
  const col = quoteIdentifier(columnName);
  // Top 25 values sorted by count, breaking ties alphabetically. We skip NULL
  // because "the most common missing value" isn't a useful answer.
  const sql = `SELECT ${col} AS value, COUNT(*) AS count
    FROM ${tbl}
    WHERE ${col} IS NOT NULL
    GROUP BY ${col}
    ORDER BY count DESC, ${col}
    LIMIT 25`;

  const rows = db.prepare(sql).all();
  return { rows, sql };
}

function summarizeNumericStats(db, tableName, columnName) {
  const tbl = quoteIdentifier(tableName);
  const col = quoteIdentifier(columnName);
  // MIN/MAX/AVG/SUM/COUNT all ignore NULL automatically.
  const sql = `SELECT
      MIN(${col})   AS min_value,
      MAX(${col})   AS max_value,
      AVG(${col})   AS avg_value,
      SUM(${col})   AS sum_value,
      COUNT(${col}) AS filled_rows
    FROM ${tbl}`;

  const row = db.prepare(sql).get() || {};
  return {
    min: row.min_value,
    max: row.max_value,
    avg: row.avg_value,
    sum: row.sum_value,
    filledRows: Number(row.filled_rows ?? 0),
    sql,
  };
}

function summarizeHistogram(db, tableName, columnName) {
  const tbl = quoteIdentifier(tableName);
  const col = quoteIdentifier(columnName);

  // First find the value range so we know where to put the bin edges.
  const rangeSql = `SELECT
      MIN(CAST(${col} AS REAL)) AS min_value,
      MAX(CAST(${col} AS REAL)) AS max_value,
      COUNT(${col})             AS filled_rows
    FROM ${tbl}
    WHERE ${col} IS NOT NULL`;
  const range = db.prepare(rangeSql).get() || {};

  const filledRows = Number(range.filled_rows ?? 0);
  if (filledRows === 0 || range.min_value === null || range.max_value === null) {
    return { bins: [], filledRows: 0, sql: rangeSql };
  }

  const minValue = Number(range.min_value);
  const maxValue = Number(range.max_value);

  // Edge case: every value is identical → one bin holding everything.
  if (minValue === maxValue) {
    return {
      bins: [{ low: minValue, high: maxValue, count: filledRows, label: String(minValue) }],
      filledRows,
      sql: rangeSql,
    };
  }

  const binCount = 10;
  const step = (maxValue - minValue) / binCount;
  const bins = [];
  // For bin i (0..8) we use: value >= low AND value < high.
  // The last bin (i = 9) uses value >= low AND value <= high so we don't
  // accidentally drop the maximum value.
  const innerBinSql = `SELECT COUNT(*) AS n
    FROM ${tbl}
    WHERE CAST(${col} AS REAL) >= ? AND CAST(${col} AS REAL) < ?`;
  const lastBinSql = `SELECT COUNT(*) AS n
    FROM ${tbl}
    WHERE CAST(${col} AS REAL) >= ? AND CAST(${col} AS REAL) <= ?`;

  const innerStmt = db.prepare(innerBinSql);
  const lastStmt = db.prepare(lastBinSql);

  for (let i = 0; i < binCount; i += 1) {
    const low = minValue + step * i;
    const high = i === binCount - 1 ? maxValue : minValue + step * (i + 1);
    const stmt = i === binCount - 1 ? lastStmt : innerStmt;
    const n = Number(stmt.get(low, high).n);
    bins.push({
      low,
      high,
      count: n,
      label: `${formatBinEdge(low)} – ${formatBinEdge(high)}`,
    });
  }

  return { bins, filledRows, sql: `${rangeSql};\n${innerBinSql};` };
}

function formatBinEdge(value) {
  if (Number.isInteger(value)) return String(value);
  return Number(value).toFixed(2);
}

function summarizeListUnique(db, tableName, columnName) {
  const tbl = quoteIdentifier(tableName);
  const col = quoteIdentifier(columnName);
  // 200 is plenty for a "have a peek" list. Without LIMIT a column with
  // thousands of unique strings would freeze the browser.
  const sql = `SELECT DISTINCT ${col} AS value
    FROM ${tbl}
    WHERE ${col} IS NOT NULL
    ORDER BY ${col}
    LIMIT 200`;

  const rows = db.prepare(sql).all();
  return { values: rows.map((r) => r.value), sql };
}

// --- Express wiring ----------------------------------------------------------

export function registerExploreRoutes(app) {
  // Tells the browser which display methods the server understands. The
  // page reads this once on load and builds the dropdown from it, so adding
  // a new method only needs SUMMARY_METHODS above to be updated.
  app.get("/api/explore/methods", (_req, res) => {
    res.json({ methods: SUMMARY_METHODS });
  });

  // List every user-created table (sqlite_* internal tables are hidden).
  app.get("/api/explore/tables", (_req, res) => {
    try {
      const db = getDb();
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all();
      res.json({ tables: rows.map((r) => r.name) });
    } catch (e) {
      res.status(500).json({ error: String(e.message) });
    }
  });

  // List the columns of one table along with whether each looks numeric.
  // The browser uses isNumeric to decide which methods make sense.
  app.get("/api/explore/columns", (req, res) => {
    try {
      const tableName = String(req.query.table ?? "");
      const db = getDb();
      assertTableExists(db, tableName);
      const cols = getColumnInfo(db, tableName).map((c) => ({
        name: c.name,
        type: c.type || "",
        isNumeric: isNumericType(c.type),
        notNull: !!c.notnull,
        primaryKey: !!c.pk,
      }));
      res.json({ table: tableName, columns: cols });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });

  // Run one of the summary methods. The body must contain { table, column, method }.
  app.post("/api/explore/summary", (req, res) => {
    try {
      const tableName = String(req.body?.table ?? "");
      const columnName = String(req.body?.column ?? "");
      const method = String(req.body?.method ?? "");

      if (!SUMMARY_METHOD_IDS.has(method)) {
        return res.status(400).json({ error: `Unknown method: ${method}` });
      }

      const db = getDb();
      assertTableExists(db, tableName);
      assertColumnExists(db, tableName, columnName);

      // For numeric-only methods, double-check the column actually looks numeric
      // so the student sees a friendly message instead of a SQL error.
      const methodSpec = SUMMARY_METHODS.find((m) => m.id === method);
      if (methodSpec.needsNumeric) {
        const colInfo = getColumnInfo(db, tableName).find((c) => c.name === columnName);
        if (!isNumericType(colInfo?.type)) {
          return res.status(400).json({
            error: `"${columnName}" is not a number column (declared type: ${
              colInfo?.type || "TEXT"
            }). Try a different method.`,
          });
        }
      }

      let payload;
      switch (method) {
        case "overview":
          payload = summarizeOverview(db, tableName, columnName);
          break;
        case "frequency":
          payload = summarizeFrequency(db, tableName, columnName);
          break;
        case "numeric_stats":
          payload = summarizeNumericStats(db, tableName, columnName);
          break;
        case "histogram":
          payload = summarizeHistogram(db, tableName, columnName);
          break;
        case "list_unique":
          payload = summarizeListUnique(db, tableName, columnName);
          break;
        default:
          // Should be unreachable thanks to SUMMARY_METHOD_IDS check above.
          return res.status(400).json({ error: `Unknown method: ${method}` });
      }

      res.json({ table: tableName, column: columnName, method, ...payload });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });
}
