/**
 * api.js — browser script for api.html.
 *
 * Big picture:
 *   1. Build a URL to the sensors API (with an optional ?limit=...).
 *   2. Call fetch(url) — the browser downloads the JSON text from the internet.
 *   3. Parse that text into a JavaScript object with JSON.parse.
 *   4. Show the whole object as raw text (section 1).
 *   5. Loop over response.data and draw an HTML <table> (section 2).
 *
 * This does NOT use our SimpleSql server for the sensor rows. The request goes
 * straight from the browser to:
 *   https://digisolia3api.vercel.app/api/sensors
 */

// --- The API we are calling -------------------------------------------------
var API_BASE = "https://digisolia3api.vercel.app/api/sensors";

// --- Cached references to elements declared with id="..." in api.html -------
var limitInput = document.getElementById("limitInput");
var loadBtn = document.getElementById("loadBtn");
var urlBox = document.getElementById("urlBox");
var errorBox = document.getElementById("errorBox");
var statusBox = document.getElementById("statusBox");
var rawOut = document.getElementById("rawOut");
var rowsOut = document.getElementById("rowsOut");

// --- Tiny helpers -----------------------------------------------------------

/**
 * Escape text so putting it inside HTML strings does not become real tags.
 * Example: if a field contained "<script>", we turn it into safe text.
 */
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

/**
 * Build the full request URL from the base + the limit the student typed.
 * encodeURIComponent keeps the query string safe if the value ever has spaces.
 */
function buildUrl() {
  var limit = Number(limitInput.value);
  if (!Number.isFinite(limit) || limit < 1) {
    limit = 10;
  }
  if (limit > 100) {
    limit = 100;
  }
  return API_BASE + "?limit=" + encodeURIComponent(String(limit));
}

// --- Main action: fetch, then show raw + rows -------------------------------

async function loadData() {
  clearError();
  clearStatus();

  var url = buildUrl();
  urlBox.textContent = "Requesting: " + url;
  rawOut.innerHTML = "<code>Loading…</code>";
  rowsOut.innerHTML = '<p class="empty">Loading…</p>';
  loadBtn.disabled = true;

  try {
    // 1) Ask the internet for the URL. fetch() returns a Response object.
    var response = await fetch(url);

    // 2) Read the body as plain text first (JSON is just specially shaped text).
    var bodyText = await response.text();

    // 3) Turn that text into a real JavaScript object / array.
    var payload;
    try {
      payload = bodyText ? JSON.parse(bodyText) : {};
    } catch (parseErr) {
      throw new Error("The API did not return valid JSON.");
    }

    // response.ok is false for status codes outside 200–299 (like 404 / 500).
    if (!response.ok) {
      throw new Error(
        payload.error || "Request failed (HTTP " + response.status + ")."
      );
    }

    // 4) Show the whole response as pretty-printed JSON text.
    showRaw(payload);

    // 5) Show only the records array as table rows.
    //    The API shape is: { total, limit, offset, data: [ {...}, {...} ] }
    showRows(payload.data || []);

    showStatus(
      "Loaded " +
        (payload.data ? payload.data.length : 0) +
        " of " +
        (payload.total != null ? payload.total : "?") +
        " total records (limit=" +
        payload.limit +
        ", offset=" +
        payload.offset +
        ")."
    );
  } catch (e) {
    rawOut.innerHTML = "<code>Could not load data.</code>";
    rowsOut.innerHTML = '<p class="empty">No rows.</p>';
    showError(String(e.message || e));
  } finally {
    loadBtn.disabled = false;
  }
}

/**
 * Section 1 — dump the whole JSON object as readable text inside <pre><code>.
 * JSON.stringify(value, null, 2) adds indentation so students can read it.
 */
function showRaw(payload) {
  var pretty = JSON.stringify(payload, null, 2);
  rawOut.innerHTML = "<code>" + escapeHtml(pretty) + "</code>";
}

/**
 * Section 2 — turn the data array into an HTML table.
 *
 * Steps:
 *   - If there are no records, show an empty message.
 *   - Read the keys of the first object to build column headers.
 *   - Loop every record and add one <tr> with a <td> per column.
 */
function showRows(records) {
  if (!records || records.length === 0) {
    rowsOut.innerHTML = '<p class="empty">The data array was empty.</p>';
    return;
  }

  // Object.keys gives the field names on the first record, e.g. "Timestamp", "Asset_ID", ...
  var columns = Object.keys(records[0]);

  var html = '<div class="table-wrap"><table><thead><tr>';
  for (var c = 0; c < columns.length; c++) {
    html = html + "<th>" + escapeHtml(columns[c]) + "</th>";
  }
  html = html + "</tr></thead><tbody>";

  for (var r = 0; r < records.length; r++) {
    var row = records[r];
    html = html + "<tr>";
    for (var k = 0; k < columns.length; k++) {
      var value = row[columns[k]];
      // null / undefined show as a dash so empty cells are visible.
      var cell =
        value === null || value === undefined ? "—" : String(value);
      html = html + "<td>" + escapeHtml(cell) + "</td>";
    }
    html = html + "</tr>";
  }

  html = html + "</tbody></table></div>";
  rowsOut.innerHTML = html;
}

// --- Wiring -----------------------------------------------------------------

loadBtn.addEventListener("click", function () {
  loadData();
});

// Optional: pressing Enter in the limit box also loads.
limitInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter") {
    loadData();
  }
});
