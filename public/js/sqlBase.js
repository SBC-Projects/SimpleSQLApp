/**
 * sqlBase.js — the simplest way to talk to the database from the browser.
 *
 * Steps this file teaches:
 *   1. Read the SQL text from the textarea.
 *   2. POST it to /api/sql (our Node server runs it against SQLite).
 *   3. Read the JSON reply (columns + rows).
 *   4. Loop through columns and rows to build an HTML <table>.
 *   5. Put that HTML into the page with innerHTML.
 *
 * Open sqlBase.html in the browser, then open this file next to it.
 */

// Grab the three page pieces we need (see ids in sqlBase.html).
var sqlBox = document.getElementById("sqlBox");
var runBtn = document.getElementById("runBtn");
var out = document.getElementById("out");

/**
 * Make text safe to put inside HTML.
 * Without this, a value like <script> could break the page.
 */
function escapeHtml(text) {
  text = String(text);
  text = text.replace(/&/g, "&amp;");
  text = text.replace(/</g, "&lt;");
  text = text.replace(/>/g, "&gt;");
  text = text.replace(/"/g, "&quot;");
  return text;
}

/**
 * Turn columns + rows into one HTML table string.
 *
 * columns = ["id", "name", "email"]
 * rows    = [ { id: 1, name: "Ada", email: "ada@example.com" }, ... ]
 *
 * We loop columns once for the header, then loop rows, and inside each
 * row we loop columns again to fill the cells.
 */
function buildTable(columns, rows) {
  var html = "<table>";

  // Header row — one <th> per column name
  html = html + "<tr>";
  for (var c = 0; c < columns.length; c++) {
    html = html + "<th>" + escapeHtml(columns[c]) + "</th>";
  }
  html = html + "</tr>";

  // Data rows — one <tr> per row, one <td> per column
  for (var r = 0; r < rows.length; r++) {
    var row = rows[r];
    html = html + "<tr>";
    for (var c2 = 0; c2 < columns.length; c2++) {
      var colName = columns[c2];
      var value = row[colName];
      if (value === null || value === undefined) {
        value = "NULL";
      }
      html = html + "<td>" + escapeHtml(value) + "</td>";
    }
    html = html + "</tr>";
  }

  html = html + "</table>";
  return html;
}

/**
 * Main action: send SQL to the server, then draw the result.
 */
async function runQuery() {
  var sql = sqlBox.value;

  // 1) Ask our server to run the SQL. The body is JSON: { "sql": "..." }
  var response = await fetch("/api/sql", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sql: sql }),
  });

  // 2) Everything from the network starts as text; JSON.parse turns it into data.
  var bodyText = await response.text();
  var data = JSON.parse(bodyText);

  // 3) If the server said something went wrong, show the error and stop.
  if (!response.ok) {
    out.innerHTML = '<p class="err">' + escapeHtml(data.error || "Error") + "</p>";
    return;
  }

  // 4) A SELECT answer looks like: { type: "result", columns: [...], rows: [...] }
  if (data.type === "result") {
    if (!data.rows || data.rows.length === 0) {
      out.innerHTML = "<p>No rows.</p>";
      return;
    }
    // 5) Loop through the results and build a table.
    out.innerHTML = buildTable(data.columns, data.rows);
    return;
  }

  // INSERT / UPDATE / CREATE do not return rows — just show a short OK note.
  out.innerHTML =
    '<p class="ok">OK — affectedRows: ' +
    escapeHtml(String(data.affectedRows)) +
    "</p>";
}

// When the student clicks Run, call runQuery().
runBtn.addEventListener("click", function () {
  runQuery();
});
