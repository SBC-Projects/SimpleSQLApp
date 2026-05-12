/**
 * upload.js — browser script for upload.html.
 *
 * Flow:
 * 1. Browser reads the Excel file and sends it to /api/upload/preview.
 * 2. Server returns suggested column names, data types, primary keys, and sample rows.
 * 3. Student reviews the CREATE TABLE SQL, creates the table, then imports all rows.
 */

var dropZone = document.getElementById("dropZone");
var fileInput = document.getElementById("fileInput");
var fileName = document.getElementById("fileName");
var errorBox = document.getElementById("errorBox");
var statusBox = document.getElementById("statusBox");
var setupSection = document.getElementById("setupSection");
var sheetInfo = document.getElementById("sheetInfo");
var tableNameInput = document.getElementById("tableName");
var columnsWrap = document.getElementById("columnsWrap");
var createSql = document.getElementById("createSql");
var copySql = document.getElementById("copySql");
var createTable = document.getElementById("createTable");
var importRows = document.getElementById("importRows");
var sampleWrap = document.getElementById("sampleWrap");

var uploadState = null;
var allowedTypes = ["TEXT", "INTEGER", "REAL", "NUMERIC"];

var LABEL_CREATE_TABLE = "Create table";
var LABEL_IMPORT_ROWS = "Import rows";

function escapeHtml(text) {
  text = String(text);
  text = text.replace(/&/g, "&amp;");
  text = text.replace(/</g, "&lt;");
  text = text.replace(/>/g, "&gt;");
  text = text.replace(/"/g, "&quot;");
  return text;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function clearError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showStatus(message) {
  statusBox.textContent = message;
  statusBox.hidden = false;
}

function clearStatus() {
  statusBox.hidden = true;
  statusBox.textContent = "";
}

function sanitizeIdentifier(value, fallback) {
  var name = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!name) {
    name = fallback;
  }
  if (!/^[a-z_]/.test(name)) {
    name = fallback + "_" + name;
  }
  return name.slice(0, 64);
}

function quoteIdentifier(identifier) {
  return '"' + identifier + '"';
}

function buildCreateSql() {
  var tableName = sanitizeIdentifier(tableNameInput.value, "uploaded_table");
  var seen = {};
  var columns = uploadState.columns;
  var normalizedColumns = [];
  var definitions = [];

  for (var i = 0; i < columns.length; i++) {
    var column = columns[i];
    var columnName = sanitizeIdentifier(column.name, "column_" + (i + 1));
    if (seen[columnName]) {
      throw new Error("Duplicate column name: " + columnName);
    }
    seen[columnName] = true;

    var type = String(column.type || "TEXT").toUpperCase();
    if (allowedTypes.indexOf(type) === -1) {
      throw new Error("Unsupported type for " + columnName + ": " + type);
    }

    normalizedColumns.push({
      name: columnName,
      type: type,
      primaryKey: column.primaryKey,
      notNull: column.notNull,
    });
  }

  var primaryKeys = normalizedColumns.filter(function (column) {
    return column.primaryKey;
  });

  for (var j = 0; j < normalizedColumns.length; j++) {
    var normalizedColumn = normalizedColumns[j];

    var constraints = [];
    if (normalizedColumn.notNull || normalizedColumn.primaryKey) {
      constraints.push("NOT NULL");
    }
    if (primaryKeys.length === 1 && normalizedColumn.primaryKey) {
      constraints.push("PRIMARY KEY");
    }

    definitions.push(
      "  " +
        quoteIdentifier(normalizedColumn.name) +
        " " +
        normalizedColumn.type +
        (constraints.length ? " " + constraints.join(" ") : "")
    );
  }

  if (primaryKeys.length > 1) {
    definitions.push(
      "  PRIMARY KEY (" +
        primaryKeys
          .map(function (column) {
            return quoteIdentifier(column.name);
          })
          .join(", ") +
        ")"
    );
  }

  return "CREATE TABLE " + quoteIdentifier(tableName) + " (\n" + definitions.join(",\n") + "\n);";
}

function readSetupFromPage(markChanged) {
  if (!uploadState) {
    return;
  }

  var rows = columnsWrap.querySelectorAll("tbody tr");
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var primaryKey = row.querySelector(".pk-input").checked;
    var notNullInput = row.querySelector(".not-null-input");

    if (primaryKey) {
      notNullInput.checked = true;
    }

    uploadState.columns[i].name = row.querySelector(".column-input").value;
    uploadState.columns[i].type = row.querySelector(".type-select").value;
    uploadState.columns[i].primaryKey = primaryKey;
    uploadState.columns[i].notNull = notNullInput.checked || primaryKey;
  }

  if (markChanged) {
    uploadState.tableCreated = false;
    importRows.disabled = true;
  }

  try {
    createSql.value = buildCreateSql();
    createTable.disabled = false;
    clearError();
  } catch (e) {
    createSql.value = String(e.message);
    createTable.disabled = true;
  }
}

function renderColumns() {
  var html = "<table><thead><tr>";
  html += "<th>Excel column</th><th>SQL column name</th><th>Data type</th><th>Primary key</th><th>Required</th>";
  html += "</tr></thead><tbody>";

  for (var i = 0; i < uploadState.columns.length; i++) {
    var column = uploadState.columns[i];
    html += "<tr>";
    html += "<td>" + escapeHtml(column.originalName) + "</td>";
    html +=
      '<td><input class="column-input" value="' + escapeHtml(column.name) + '" autocomplete="off" /></td>';
    html += '<td><select class="type-select">';
    for (var t = 0; t < allowedTypes.length; t++) {
      var type = allowedTypes[t];
      html +=
        '<option value="' +
        type +
        '"' +
        (column.type === type ? " selected" : "") +
        ">" +
        type +
        "</option>";
    }
    html += "</select></td>";
    html +=
      '<td><input class="pk-input" type="checkbox"' +
      (column.primaryKey ? " checked" : "") +
      " /></td>";
    html +=
      '<td><input class="not-null-input" type="checkbox"' +
      (column.notNull || column.primaryKey ? " checked" : "") +
      " /></td>";
    html += "</tr>";
  }

  html += "</tbody></table>";
  columnsWrap.innerHTML = html;
}

function renderSampleRows() {
  if (uploadState.sampleRows.length === 0) {
    sampleWrap.innerHTML = '<p class="hint">No data rows were found after the header row.</p>';
    return;
  }

  var html = "<table><thead><tr>";
  for (var i = 0; i < uploadState.columns.length; i++) {
    html += "<th>" + escapeHtml(uploadState.columns[i].name) + "</th>";
  }
  html += "</tr></thead><tbody>";

  for (var r = 0; r < uploadState.sampleRows.length; r++) {
    html += "<tr>";
    for (var c = 0; c < uploadState.columns.length; c++) {
      var value = uploadState.sampleRows[r][c];
      html += "<td>" + escapeHtml(value === null ? "NULL" : value) + "</td>";
    }
    html += "</tr>";
  }

  html += "</tbody></table>";
  sampleWrap.innerHTML = html;
}

function renderPreview(data) {
  uploadState = {
    uploadId: data.uploadId,
    columns: data.columns,
    rowCount: data.rowCount,
    sampleRows: data.sampleRows,
    tableCreated: false,
  };

  tableNameInput.value = data.tableName;
  sheetInfo.textContent =
    'Sheet "' + data.sheetName + '" found with ' + data.columns.length + " columns and " + data.rowCount + " rows.";
  setupSection.hidden = false;
  importRows.disabled = true;
  renderColumns();
  renderSampleRows();
  readSetupFromPage(false);
}

function readFileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function () {
      resolve(reader.result);
    };
    reader.onerror = function () {
      reject(reader.error || new Error("Could not read file."));
    };
    reader.readAsDataURL(file);
  });
}

async function postJson(url, payload) {
  var response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  var text = await response.text();
  var data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (ignored) {
    data = { error: text || "Request failed." };
  }

  if (!response.ok) {
    throw new Error(data.error || "Request failed (" + response.status + ").");
  }

  return data;
}

async function previewFile(file) {
  clearError();
  clearStatus();

  if (!file || !/\.xlsx$/i.test(file.name)) {
    showError("Choose an Excel file ending in .xlsx.");
    return;
  }

  fileName.textContent = file.name;
  showStatus("Reading Excel file...");

  try {
    var dataBase64 = await readFileAsDataUrl(file);
    var data = await postJson("/api/upload/preview", {
      fileName: file.name,
      dataBase64: dataBase64,
    });
    renderPreview(data);
    showStatus("Preview ready. Check the schema, then create the table.");
  } catch (e) {
    showError(String(e.message));
    clearStatus();
  }
}

dropZone.addEventListener("dragover", function (evt) {
  evt.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", function () {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", function (evt) {
  evt.preventDefault();
  dropZone.classList.remove("dragging");
  previewFile(evt.dataTransfer.files[0]);
});

fileInput.addEventListener("change", function () {
  previewFile(fileInput.files[0]);
});

columnsWrap.addEventListener("input", function () {
  readSetupFromPage(true);
});

columnsWrap.addEventListener("change", function () {
  readSetupFromPage(true);
});

tableNameInput.addEventListener("input", function () {
  if (uploadState) {
    uploadState.tableCreated = false;
    importRows.disabled = true;
    readSetupFromPage(false);
  }
});

copySql.addEventListener("click", async function () {
  try {
    await navigator.clipboard.writeText(createSql.value);
    showStatus("CREATE TABLE SQL copied.");
  } catch (ignored) {
    createSql.focus();
    createSql.select();
    showStatus("SQL selected. Press Ctrl+C to copy it.");
  }
});

createTable.addEventListener("click", async function () {
  if (!uploadState) {
    return;
  }

  readSetupFromPage(false);
  clearError();
  showStatus("Sending CREATE TABLE to the server…");

  copySql.disabled = true;
  importRows.disabled = true;
  createTable.disabled = true;
  createTable.classList.add("busy");
  createTable.setAttribute("aria-busy", "true");
  createTable.textContent = "Creating…";

  try {
    var data = await postJson("/api/upload/create-table", {
      uploadId: uploadState.uploadId,
      tableName: tableNameInput.value,
      columns: uploadState.columns,
    });
    createSql.value = data.createSql;
    uploadState.tableCreated = true;
    importRows.disabled = false;
    showStatus("Table created in SQLite. You can import the rows next.");
  } catch (e) {
    showError(String(e.message));
    clearStatus();
  } finally {
    copySql.disabled = false;
    createTable.classList.remove("busy");
    createTable.removeAttribute("aria-busy");
    createTable.textContent = LABEL_CREATE_TABLE;
    createTable.disabled = false;
    importRows.disabled = !uploadState || !uploadState.tableCreated;
    readSetupFromPage(false);
  }
});

importRows.addEventListener("click", async function () {
  if (!uploadState || !uploadState.tableCreated) {
    showError("Create the table before importing rows.");
    return;
  }

  clearError();
  showStatus("Sending rows to the server (this can take a moment on large sheets)…");

  copySql.disabled = true;
  createTable.disabled = true;
  importRows.disabled = true;
  importRows.classList.add("busy");
  importRows.setAttribute("aria-busy", "true");
  importRows.textContent = "Importing…";

  var importOk = false;
  try {
    var data = await postJson("/api/upload/import", {
      uploadId: uploadState.uploadId,
      tableName: tableNameInput.value,
      columns: uploadState.columns,
    });
    importOk = true;
    showStatus("Done: imported " + data.insertedRows + " rows into table " + data.tableName + ".");
    importRows.disabled = true;
  } catch (e) {
    showError(String(e.message));
    clearStatus();
  } finally {
    copySql.disabled = false;
    importRows.classList.remove("busy");
    importRows.removeAttribute("aria-busy");
    importRows.textContent = LABEL_IMPORT_ROWS;
    createTable.disabled = false;
    if (importOk) {
      importRows.disabled = true;
    } else {
      importRows.disabled = !uploadState || !uploadState.tableCreated;
    }
  }
});
