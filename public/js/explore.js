/**
 * explore.js — browser script for explore.html.
 *
 * Big picture:
 *   1. On page load, fetch the list of tables (GET /api/explore/tables) and
 *      the list of available display methods (GET /api/explore/methods), and
 *      put them into <select> dropdowns.
 *   2. When the student picks a table, fetch its columns
 *      (GET /api/explore/columns?table=...) and fill the column dropdown.
 *      Number columns get a "(number)" tag so it's clear which methods fit.
 *   3. When the student clicks "Show summary", POST the chosen
 *      table+column+method to /api/explore/summary and render whatever
 *      shape comes back.
 *
 * Each render function below handles one method. They all build HTML
 * strings — no template library is used. Read renderFrequency() first if
 * you want to see how the bar chart is just <div>s with widths set as
 * percentages of the largest count.
 */

// --- Cached references to elements declared with id="..." in explore.html ---
var tableSelect = document.getElementById("tableSelect");
var columnSelect = document.getElementById("columnSelect");
var methodSelect = document.getElementById("methodSelect");
var methodHint = document.getElementById("methodHint");
var runBtn = document.getElementById("runBtn");
var summaryOut = document.getElementById("summaryOut");
var errorBox = document.getElementById("errorBox");
var statusBox = document.getElementById("statusBox");

// We hold on to the latest column list and method list so the UI can react
// (e.g. show "(number)" next to numeric columns, disable methods that need
// a numeric column when the picked column isn't numeric).
var currentColumns = [];
var availableMethods = [];

// --- Tiny helpers -----------------------------------------------------------

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

// Round numbers to a sensible number of decimals when showing them.
// Whole numbers are kept as-is; fractions show 2 decimals.
function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  var n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Wraps fetch() so non-200 responses become thrown errors with the server's
// error message. This keeps the calling code small.
async function getJson(url) {
  var response = await fetch(url);
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

// --- Loading the dropdowns --------------------------------------------------

async function loadTables() {
  clearError();
  try {
    var data = await getJson("/api/explore/tables");
    var tables = data.tables || [];

    if (tables.length === 0) {
      tableSelect.innerHTML = '<option value="">No tables yet — upload one first.</option>';
      return;
    }

    var options = ['<option value="">— pick a table —</option>'];
    for (var i = 0; i < tables.length; i++) {
      options.push(
        '<option value="' + escapeHtml(tables[i]) + '">' + escapeHtml(tables[i]) + "</option>"
      );
    }
    tableSelect.innerHTML = options.join("");
  } catch (e) {
    tableSelect.innerHTML = '<option value="">Could not load tables.</option>';
    showError(String(e.message));
  }
}

async function loadMethods() {
  try {
    var data = await getJson("/api/explore/methods");
    availableMethods = data.methods || [];
    rebuildMethodOptions();
  } catch (e) {
    methodSelect.innerHTML = '<option value="">Could not load methods.</option>';
    showError(String(e.message));
  }
}

async function loadColumns(tableName) {
  currentColumns = [];
  columnSelect.disabled = true;
  columnSelect.innerHTML = '<option value="">Loading columns…</option>';
  rebuildMethodOptions();
  updateRunButton();

  if (!tableName) {
    columnSelect.innerHTML = '<option value="">Pick a table first</option>';
    return;
  }

  try {
    var data = await getJson("/api/explore/columns?table=" + encodeURIComponent(tableName));
    currentColumns = data.columns || [];

    if (currentColumns.length === 0) {
      columnSelect.innerHTML = '<option value="">No columns found.</option>';
      return;
    }

    var options = ['<option value="">— pick a column —</option>'];
    for (var i = 0; i < currentColumns.length; i++) {
      var c = currentColumns[i];
      // Add "(number)" so students can see at a glance which columns work
      // with numeric-only methods.
      var typeTag = c.isNumeric ? " (number)" : "";
      options.push(
        '<option value="' +
          escapeHtml(c.name) +
          '">' +
          escapeHtml(c.name) +
          escapeHtml(typeTag) +
          "</option>"
      );
    }
    columnSelect.innerHTML = options.join("");
    columnSelect.disabled = false;
  } catch (e) {
    columnSelect.innerHTML = '<option value="">Could not load columns.</option>';
    showError(String(e.message));
  }
}

// Rebuild the method dropdown so methods that NEED a numeric column are
// hidden / disabled when the picked column isn't numeric.
function rebuildMethodOptions() {
  if (availableMethods.length === 0) {
    methodSelect.innerHTML = '<option value="">No methods available.</option>';
    methodSelect.disabled = true;
    return;
  }

  var pickedColumn = currentColumns.find(function (c) {
    return c.name === columnSelect.value;
  });

  if (!pickedColumn) {
    methodSelect.innerHTML = '<option value="">Pick a column first</option>';
    methodSelect.disabled = true;
    return;
  }

  var options = ['<option value="">— pick a method —</option>'];
  for (var i = 0; i < availableMethods.length; i++) {
    var m = availableMethods[i];
    var disabledAttr = m.needsNumeric && !pickedColumn.isNumeric ? " disabled" : "";
    var suffix = m.needsNumeric && !pickedColumn.isNumeric ? " (needs a number column)" : "";
    options.push(
      '<option value="' +
        escapeHtml(m.id) +
        '"' +
        disabledAttr +
        ">" +
        escapeHtml(m.label + suffix) +
        "</option>"
    );
  }
  methodSelect.innerHTML = options.join("");
  methodSelect.disabled = false;
  updateMethodHint();
}

function updateMethodHint() {
  var picked = availableMethods.find(function (m) {
    return m.id === methodSelect.value;
  });
  methodHint.textContent = picked
    ? picked.description
    : "Pick a method to see what it does.";
}

function updateRunButton() {
  runBtn.disabled = !(tableSelect.value && columnSelect.value && methodSelect.value);
}

// --- Asking the server for a summary ---------------------------------------

async function runSummary() {
  clearError();
  clearStatus();

  var payload = {
    table: tableSelect.value,
    column: columnSelect.value,
    method: methodSelect.value,
  };

  summaryOut.innerHTML = '<p class="empty">Working…</p>';
  runBtn.disabled = true;

  try {
    var data = await postJson("/api/explore/summary", payload);
    renderSummary(data);
    showStatus(
      "Showed " + payload.method + " for " + payload.table + "." + payload.column + "."
    );
  } catch (e) {
    summaryOut.innerHTML = '<p class="empty">No result.</p>';
    showError(String(e.message));
  } finally {
    updateRunButton();
  }
}

// --- Renderers (one per method) --------------------------------------------
//
// Each renderer takes the JSON payload from the server and returns nothing
// — it writes HTML straight into summaryOut.

function renderSummary(data) {
  switch (data.method) {
    case "overview":
      renderOverview(data);
      break;
    case "frequency":
      renderFrequency(data);
      break;
    case "numeric_stats":
      renderNumericStats(data);
      break;
    case "histogram":
      renderHistogram(data);
      break;
    case "list_unique":
      renderListUnique(data);
      break;
    default:
      summaryOut.innerHTML =
        '<p class="empty">Unknown method: ' + escapeHtml(String(data.method)) + "</p>";
  }
}

// Re-usable footer that shows the SQL the server ran for this summary.
function renderSqlPanel(sqlText) {
  if (!sqlText) return "";
  return (
    '<div class="sql-panel"><span class="sql-panel-label">SQL the server ran:</span>' +
    escapeHtml(sqlText) +
    "</div>"
  );
}

function renderHeading(data) {
  return (
    "<h3>" +
    escapeHtml(data.table) +
    "." +
    escapeHtml(data.column) +
    "</h3>"
  );
}

function renderOverview(data) {
  var html =
    renderHeading(data) +
    '<div class="stats-grid">' +
    statCard("Total rows", formatNumber(data.totalRows)) +
    statCard("Filled cells", formatNumber(data.filledRows)) +
    statCard("Blank (NULL) cells", formatNumber(data.nullRows)) +
    statCard("Different values", formatNumber(data.distinctValues)) +
    "</div>" +
    renderSqlPanel(data.sql);
  summaryOut.innerHTML = html;
}

function renderNumericStats(data) {
  var html =
    renderHeading(data) +
    '<div class="stats-grid">' +
    statCard("Filled cells", formatNumber(data.filledRows)) +
    statCard("Minimum", formatNumber(data.min)) +
    statCard("Maximum", formatNumber(data.max)) +
    statCard("Average", formatNumber(data.avg)) +
    statCard("Sum", formatNumber(data.sum)) +
    "</div>" +
    renderSqlPanel(data.sql);
  summaryOut.innerHTML = html;
}

function statCard(label, value) {
  return (
    '<div class="stat-card">' +
    '<span class="stat-label">' +
    escapeHtml(label) +
    "</span>" +
    '<span class="stat-value">' +
    escapeHtml(value) +
    "</span>" +
    "</div>"
  );
}

function renderFrequency(data) {
  var rows = data.rows || [];
  if (rows.length === 0) {
    summaryOut.innerHTML =
      renderHeading(data) +
      '<p class="empty">No values found in this column.</p>' +
      renderSqlPanel(data.sql);
    return;
  }

  // Find the largest count so every bar is sized as a percentage of it.
  var maxCount = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].count > maxCount) maxCount = rows[i].count;
  }

  var bars = ['<div class="bar-chart">'];
  for (var j = 0; j < rows.length; j++) {
    var row = rows[j];
    var labelText = row.value === null || row.value === undefined ? "(blank)" : String(row.value);
    // Math.max keeps a thin sliver visible even for the smallest bar.
    var widthPct = Math.max(2, Math.round((row.count / maxCount) * 100));
    bars.push(
      '<div class="bar-row">' +
        '<span class="bar-label" title="' +
        escapeHtml(labelText) +
        '">' +
        escapeHtml(labelText) +
        "</span>" +
        '<div class="bar-track"><div class="bar-fill" style="width: ' +
        widthPct +
        '%"></div></div>' +
        '<span class="bar-count">' +
        formatNumber(row.count) +
        "</span>" +
        "</div>"
    );
  }
  bars.push("</div>");

  summaryOut.innerHTML =
    renderHeading(data) +
    '<p class="hint">Top ' +
    rows.length +
    " value" +
    (rows.length === 1 ? "" : "s") +
    " by count.</p>" +
    bars.join("") +
    renderSqlPanel(data.sql);
}

function renderHistogram(data) {
  var bins = data.bins || [];
  if (bins.length === 0) {
    summaryOut.innerHTML =
      renderHeading(data) +
      '<p class="empty">No numeric values to plot.</p>' +
      renderSqlPanel(data.sql);
    return;
  }

  var maxCount = 0;
  for (var i = 0; i < bins.length; i++) {
    if (bins[i].count > maxCount) maxCount = bins[i].count;
  }

  var bars = ['<div class="bar-chart">'];
  for (var j = 0; j < bins.length; j++) {
    var bin = bins[j];
    var widthPct = maxCount === 0 ? 0 : Math.max(2, Math.round((bin.count / maxCount) * 100));
    bars.push(
      '<div class="bar-row">' +
        '<span class="bar-label" title="' +
        escapeHtml(bin.label) +
        '">' +
        escapeHtml(bin.label) +
        "</span>" +
        '<div class="bar-track"><div class="bar-fill" style="width: ' +
        widthPct +
        '%"></div></div>' +
        '<span class="bar-count">' +
        formatNumber(bin.count) +
        "</span>" +
        "</div>"
    );
  }
  bars.push("</div>");

  summaryOut.innerHTML =
    renderHeading(data) +
    '<p class="hint">Values split into ' +
    bins.length +
    " equal-width bins from MIN to MAX (" +
    formatNumber(data.filledRows) +
    " row" +
    (data.filledRows === 1 ? "" : "s") +
    ").</p>" +
    bars.join("") +
    renderSqlPanel(data.sql);
}

function renderListUnique(data) {
  var values = data.values || [];
  if (values.length === 0) {
    summaryOut.innerHTML =
      renderHeading(data) +
      '<p class="empty">No values found in this column.</p>' +
      renderSqlPanel(data.sql);
    return;
  }

  var items = ['<ul class="unique-list">'];
  for (var i = 0; i < values.length; i++) {
    items.push("<li>" + escapeHtml(String(values[i])) + "</li>");
  }
  items.push("</ul>");

  var capNote =
    values.length === 200
      ? '<p class="hint">Showing the first 200 unique values (limit set in the server).</p>'
      : '<p class="hint">' + values.length + " unique value" + (values.length === 1 ? "" : "s") + ".</p>";

  summaryOut.innerHTML =
    renderHeading(data) + capNote + items.join("") + renderSqlPanel(data.sql);
}

// --- Wiring up events -------------------------------------------------------

tableSelect.addEventListener("change", function () {
  loadColumns(tableSelect.value);
});

columnSelect.addEventListener("change", function () {
  rebuildMethodOptions();
  updateRunButton();
});

methodSelect.addEventListener("change", function () {
  updateMethodHint();
  updateRunButton();
});

runBtn.addEventListener("click", function () {
  runSummary();
});

// Kick things off as soon as the script loads.
loadMethods();
loadTables();
