/**
 * Excel upload API.
 *
 * The browser sends a .xlsx file for a short preview pass, then the student
 * confirms the schema before creating the table and importing all rows.
 */

import path from "path";
import { randomUUID } from "crypto";
import { readSheet } from "read-excel-file/node";
import { getDb } from "./db.js";

// Temporary parsed Excel files waiting for the user to create a table and import rows.
const uploadPreviews = new Map();
const UPLOAD_TTL_MS = 60 * 60 * 1000;
const SQLITE_UPLOAD_TYPES = new Set(["TEXT", "INTEGER", "REAL", "NUMERIC"]);

function isBlankCell(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

function normalizeParsedRows(parsedRows) {
  if (!Array.isArray(parsedRows)) {
    throw new Error("Could not read rows from the Excel file.");
  }

  return parsedRows.map((row) => {
    if (Array.isArray(row)) return row;
    if (row === undefined || row === null) return [];
    if (typeof row === "object") return Object.values(row);
    return [row];
  });
}

function safeRowLength(row) {
  return Array.isArray(row) ? row.length : 0;
}

function sanitizeIdentifier(value, fallback) {
  let name = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!name) name = fallback;
  if (!/^[a-z_]/.test(name)) name = `${fallback}_${name}`;
  return name.slice(0, 64);
}

function makeUniqueIdentifier(name, usedNames) {
  let uniqueName = name;
  let suffix = 2;
  while (usedNames.has(uniqueName)) {
    uniqueName = `${name}_${suffix}`;
    suffix += 1;
  }
  usedNames.add(uniqueName);
  return uniqueName;
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL name: ${identifier}`);
  }
  return `"${identifier}"`;
}

function cellToDbValue(value) {
  if (isBlankCell(value)) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  return value;
}

function inferSqliteType(values) {
  const filled = values.filter((value) => !isBlankCell(value));
  if (filled.length === 0) return "TEXT";
  if (filled.some((value) => value instanceof Date)) return "TEXT";
  if (filled.every((value) => typeof value === "boolean")) return "INTEGER";
  if (filled.every((value) => Number.isInteger(Number(value)))) return "INTEGER";
  if (filled.every((value) => Number.isFinite(Number(value)))) return "REAL";
  return "TEXT";
}

function looksUnique(values) {
  const filled = values.filter((value) => !isBlankCell(value)).map((value) => String(value));
  return filled.length > 0 && filled.length === values.length && new Set(filled).size === filled.length;
}

async function parseExcelWorkbook(base64Data, fileName) {
  const base64 = String(base64Data ?? "").replace(/^data:.*;base64,/, "");
  if (!base64) throw new Error("Excel file data is required.");

  let matrix;
  try {
    // `readSheet` returns the first worksheet as a 2D array of cells (unlike `readXlsxFile`,
    // which returns `[{ sheet, data }, ...]` in v9).
    matrix = await readSheet(Buffer.from(base64, "base64"));
  } catch (e) {
    const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    throw new Error(
      msg.includes("zip") || msg.includes("archive")
        ? "That file is not a valid .xlsx workbook (or it is corrupted)."
        : `Could not read the Excel file: ${msg}`
    );
  }

  const rawRows = normalizeParsedRows(matrix);
  if (rawRows.length === 0) throw new Error("The first sheet is empty.");

  const headerIndex = rawRows.findIndex((row) => Array.isArray(row) && row.some((cell) => !isBlankCell(cell)));
  if (headerIndex === -1) throw new Error("The first sheet is empty.");

  const headerRow = Array.isArray(rawRows[headerIndex]) ? rawRows[headerIndex] : [];
  const rawDataRows = rawRows.slice(headerIndex + 1);
  const width = Math.max(safeRowLength(headerRow), 0, ...rawDataRows.map(safeRowLength));
  const usedIndexes = [];

  for (let index = 0; index < width; index += 1) {
    const headerHasValue = !isBlankCell(headerRow[index]);
    const columnHasValue = rawDataRows.some((row) => !isBlankCell(Array.isArray(row) ? row[index] : undefined));
    if (headerHasValue || columnHasValue) usedIndexes.push(index);
  }

  if (usedIndexes.length === 0) throw new Error("No columns were found in the first sheet.");

  const usedNames = new Set();
  const columns = usedIndexes.map((sourceIndex, visibleIndex) => {
    const originalName = isBlankCell(headerRow[sourceIndex])
      ? `column_${visibleIndex + 1}`
      : String(headerRow[sourceIndex]).trim();
    const name = makeUniqueIdentifier(
      sanitizeIdentifier(originalName, `column_${visibleIndex + 1}`),
      usedNames
    );
    const values = rawDataRows.map((row) => (Array.isArray(row) ? row[sourceIndex] : undefined));
    const type = inferSqliteType(values);
    return {
      index: visibleIndex,
      sourceIndex,
      originalName,
      name,
      type,
      notNull: false,
      primaryKey: false,
    };
  });

  const idColumn = columns.find((column) => {
    const lowerName = column.name.toLowerCase();
    const values = rawDataRows.map((row) => (Array.isArray(row) ? row[column.sourceIndex] : undefined));
    return (lowerName === "id" || lowerName.endsWith("_id")) && looksUnique(values);
  });
  if (idColumn) idColumn.primaryKey = true;

  const rows = rawDataRows
    .map((row) =>
      columns.map((column) =>
        cellToDbValue(Array.isArray(row) ? row[column.sourceIndex] : undefined)
      )
    )
    .filter((row) => row.some((value) => value !== null));

  const tableName = sanitizeIdentifier(path.parse(String(fileName || "uploaded_table")).name, "uploaded_table");

  return {
    sheetName: "Sheet 1",
    tableName,
    columns,
    rows,
    sampleRows: rows.slice(0, 8),
  };
}

function cleanupOldUploads() {
  const now = Date.now();
  for (const [uploadId, preview] of uploadPreviews.entries()) {
    if (now - preview.createdAt > UPLOAD_TTL_MS) uploadPreviews.delete(uploadId);
  }
}

function rememberUpload(preview) {
  cleanupOldUploads();
  const uploadId = randomUUID();
  uploadPreviews.set(uploadId, { ...preview, createdAt: Date.now() });
  return uploadId;
}

function buildCreateTableSql(tableName, columns) {
  const safeTableName = sanitizeIdentifier(tableName, "uploaded_table");
  const seenNames = new Set();

  if (columns.length === 0) throw new Error("At least one column is required.");

  const normalizedColumns = columns.map((column, index) => {
    const name = sanitizeIdentifier(column.name, `column_${index + 1}`);
    if (seenNames.has(name)) throw new Error(`Duplicate column name: ${name}`);
    seenNames.add(name);

    const type = String(column.type || "TEXT").toUpperCase();
    if (!SQLITE_UPLOAD_TYPES.has(type)) throw new Error(`Unsupported type for ${name}: ${type}`);

    return { ...column, name, type };
  });

  const primaryKeys = normalizedColumns.filter((column) => column.primaryKey);
  const definitions = normalizedColumns.map((column) => {
    const constraints = [];
    if (column.notNull || column.primaryKey) constraints.push("NOT NULL");
    if (primaryKeys.length === 1 && column.primaryKey) constraints.push("PRIMARY KEY");

    return `  ${quoteIdentifier(column.name)} ${column.type}${
      constraints.length ? ` ${constraints.join(" ")}` : ""
    }`;
  });

  if (primaryKeys.length > 1) {
    const keyNames = primaryKeys.map((column) => quoteIdentifier(column.name));
    definitions.push(`  PRIMARY KEY (${keyNames.join(", ")})`);
  }

  return `CREATE TABLE ${quoteIdentifier(safeTableName)} (\n${definitions.join(",\n")}\n);`;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "bigint") return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function buildInsertSql(tableName, columns, rows) {
  const safeTableName = sanitizeIdentifier(tableName, "uploaded_table");
  const safeColumnNames = columns.map((column, index) =>
    sanitizeIdentifier(column.name, `column_${index + 1}`)
  );
  const columnList = safeColumnNames.map(quoteIdentifier).join(", ");

  if (!rows.length) {
    return `-- No rows to insert into ${quoteIdentifier(safeTableName)}`;
  }

  const valueLines = rows.map((row) => {
    const values = safeColumnNames.map((_, index) => sqlLiteral(row[index]));
    return `  (${values.join(", ")})`;
  });

  return `INSERT INTO ${quoteIdentifier(safeTableName)} (${columnList}) VALUES\n${valueLines.join(",\n")};`;
}

function resolveCreateSql(tableName, columns, customCreateSql) {
  const builtSql = buildCreateTableSql(tableName, columns);
  if (typeof customCreateSql !== "string" || !customCreateSql.trim()) {
    return builtSql;
  }

  const createSql = customCreateSql.trim();
  if (!/^\s*CREATE\s+TABLE\b/i.test(createSql)) {
    throw new Error("Custom SQL must be a CREATE TABLE statement.");
  }
  return createSql;
}

function getUploadSpec(req) {
  const uploadId = String(req.body?.uploadId ?? "");
  const preview = uploadPreviews.get(uploadId);
  if (!preview) throw new Error("Upload preview expired or was not found. Drop the file again.");

  const columns = req.body?.columns;
  if (!Array.isArray(columns) || columns.length !== preview.columns.length) {
    throw new Error("Column setup does not match the uploaded sheet.");
  }

  return {
    preview,
    tableName: sanitizeIdentifier(req.body?.tableName, "uploaded_table"),
    columns,
  };
}

export function registerExcelUploadRoutes(app) {
  app.post("/api/upload/preview", async (req, res) => {
    try {
      const preview = await parseExcelWorkbook(req.body?.dataBase64, req.body?.fileName);
      const uploadId = rememberUpload(preview);
      const createSql = buildCreateTableSql(preview.tableName, preview.columns);

      res.json({
        uploadId,
        sheetName: preview.sheetName,
        tableName: preview.tableName,
        columns: preview.columns.map(({ sourceIndex, ...column }) => column),
        rowCount: preview.rows.length,
        sampleRows: preview.sampleRows,
        createSql,
      });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });

  app.post("/api/upload/create-table", (req, res) => {
    try {
      const { tableName, columns } = getUploadSpec(req);
      const createSql = resolveCreateSql(tableName, columns, req.body?.createSql);

      const db = getDb();
      db.exec(createSql);

      res.json({ tableName, createSql });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });

  app.post("/api/upload/insert-sql", (req, res) => {
    try {
      const { preview, tableName, columns } = getUploadSpec(req);
      const safeTableName = sanitizeIdentifier(tableName, "uploaded_table");
      const insertSql = buildInsertSql(safeTableName, columns, preview.rows);
      res.json({ tableName: safeTableName, insertSql, rowCount: preview.rows.length });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });

  app.post("/api/upload/import", (req, res) => {
    try {
      const { preview, tableName, columns } = getUploadSpec(req);
      const createSql = buildCreateTableSql(tableName, columns);
      const safeTableName = sanitizeIdentifier(tableName, "uploaded_table");
      const safeColumnNames = columns.map((column, index) =>
        sanitizeIdentifier(column.name, `column_${index + 1}`)
      );

      const parameterizedInsertSql = `INSERT INTO ${quoteIdentifier(safeTableName)} (${safeColumnNames
        .map(quoteIdentifier)
        .join(", ")}) VALUES (${safeColumnNames.map(() => "?").join(", ")})`;

      const db = getDb();
      const insert = db.prepare(parameterizedInsertSql);
      let insertedRows = 0;

      db.exec("BEGIN");
      try {
        for (const row of preview.rows) {
          insert.run(...row);
          insertedRows += 1;
        }
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      res.json({ tableName: safeTableName, insertedRows, createSql });
    } catch (e) {
      res.status(400).json({ error: String(e.message) });
    }
  });
}
