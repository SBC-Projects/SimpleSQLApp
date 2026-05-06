/**
 * users.js — browser script for the Users page (index.html).
 *
 * The server (server.js) serves this file under /js/users.js. The browser downloads it here and runs it.
 *
 * Rough flow:
 * 1. loadUsers() asks GET /api/users for JSON, then draws a table.
 * 2. Table rows contain <input>s you can edit; Save sends PUT /api/users/:id.
 * 3. The form at the top sends POST /api/users to insert a row.
 */

// --- Cached references to elements that index.html declared with id="..." ---
var tableWrap = document.getElementById("tableWrap"); // Where the HTML table appears
var listErr = document.getElementById("listErr"); // Red message if listing users failed
var userForm = document.getElementById("userForm"); // "Add a user" <form>
var formErr = document.getElementById("formErr"); // Message under form if POST failed
var nameInput = document.getElementById("name");
var emailInput = document.getElementById("email");

/**
 * Escape text so putting it inside HTML strings does not become real tags/scripts.
 * Example: if someone's name contained "<script>", we'd turn it into safe text in the page source.
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
 * Refresh the whole list from the server.
 * Uses response.text() first, then JSON.parse — same result as await response.json() but clearer
 * for seeing "everything comes back as text; JSON is special text shaped like data".
 */
async function loadUsers() {
  listErr.hidden = true;
  tableWrap.innerHTML = "";

  var response = await fetch("/api/users");
  var bodyText = await response.text();

  // response.ok is false for status codes outside 200–299 (like 404 / 500)
  if (!response.ok) {
    try {
      var bad = JSON.parse(bodyText);
      listErr.textContent = bad.error || "Could not load users.";
    } catch (ignored) {
      // Server might have returned plain text HTML error — show a generic line
      listErr.textContent = "Could not load users.";
    }
    listErr.hidden = false;
    return;
  }

  var users = JSON.parse(bodyText);
  drawTable(users);
}

/**
 * Build an HTML <table> as one big string (no templating libraries in this starter project).
 * Each user row carries data-id="..." on buttons so clicks know WHICH id to SAVE or DELETE.
 */
function drawTable(users) {
  var hintEl = document.getElementById("hint");
  if (users.length === 0 && hintEl) {
    hintEl.hidden = true;
  } else if (hintEl) {
    hintEl.hidden = false;
  }

  if (users.length === 0) {
    tableWrap.innerHTML = '<p class="empty">No users yet. Add someone above!</p>';
    return;
  }

  var html = "<table><thead><tr>";
  html =
    html +
    "<th>id</th><th>Name</th><th>Email</th><th>Saved at</th><th></th></tr></thead><tbody>";

  var rowIndex = 0;
  for (; rowIndex < users.length; rowIndex++) {
    var person = users[rowIndex];
    var idText = escapeHtml(String(person.id));
    // Normalize missing fields — JSON might omit keys; null is also possible from the DB driver
    var nm = person.name === undefined || person.name === null ? "" : person.name;
    var em = person.email === undefined || person.email === null ? "" : person.email;
    var when =
      person.created_at === undefined || person.created_at === null ? "" : person.created_at;

    html = html + "<tr>";
    html = html + "<td>" + idText + "</td>";
    html =
      html +
      '<td><input class="cell-input row-name" value="' +
      escapeHtml(nm) +
      '" /></td>';
    html =
      html +
      '<td><input class="cell-input row-email" type="email" value="' +
      escapeHtml(em) +
      '" /></td>';
    html = html + "<td>" + escapeHtml(String(when)) + "</td>";
    // Both buttons stash the SAME person.id inside data-id (HTML only allows simple strings — good for IDs)
    html =
      html +
      '<td class="table-actions">' +
      '<button type="button" class="primary row-save" data-id="' +
      person.id +
      '">Save</button> ';
    html =
      html +
      '<button type="button" class="delete-btn danger" data-id="' +
      person.id +
      '">Delete</button></td>';
    html = html + "</tr>";
  }

  html = html + "</tbody></table>";
  // innerHTML parses the text into real DOM nodes; old button listeners disappear (that's OK—we use ONE parent listener below)
  tableWrap.innerHTML = html;
}

/**
 * Walk from the clicked Save button up to its <td>, then to the containing <tr>, then find inputs inside that ONE row only.
 */
async function saveRow(saveButton) {
  var td = saveButton.parentElement;
  var tr = td.parentElement;
  var nameBox = tr.querySelector(".row-name");
  var emailBox = tr.querySelector(".row-email");
  var id = saveButton.getAttribute("data-id");

  var payload = {
    name: nameBox.value.trim(),
    email: emailBox.value.trim(),
  };

  var response = await fetch("/api/users/" + id, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload), // Turns the object into ONE string matching application/json
  });

  if (response.ok) {
    await loadUsers(); // Repaint so "Saved at" matches what the DB stored
    return;
  }

  try {
    var bad = await response.json();
    alert(bad.error || "Save failed.");
  } catch (ignored) {
    alert("Save failed.");
  }
}

async function deleteUser(id) {
  if (!confirm("Delete this user?")) {
    return;
  }

  var response = await fetch("/api/users/" + id, { method: "DELETE" });

  // 204 No Content = success AND no JSON body — that is deliberate on server.js so we MUST NOT try response.json() blindly
  if (response.status === 204) {
    await loadUsers();
    return;
  }

  try {
    var bad = await response.json();
    alert(bad.error || "Delete failed.");
  } catch (ignored) {
    alert("Delete failed.");
  }
}

// Event delegation: one listener watches every click bubbling up from inside tableWrap.
// We only react if evt.target itself is a <button> carrying our classes — no per-row addEventListener bookkeeping.
tableWrap.addEventListener("click", function (evt) {
  var target = evt.target;
  if (target.tagName !== "BUTTON") {
    return;
  }
  if (target.classList.contains("row-save")) {
    saveRow(target);
    return;
  }
  if (target.classList.contains("delete-btn")) {
    deleteUser(target.getAttribute("data-id"));
  }
});

// submit event fires before the browser navigates away; preventDefault stops a full-page POST (would break our SPA-lite flow)
userForm.addEventListener("submit", async function (evt) {
  evt.preventDefault();
  formErr.hidden = true;

  var payload = {
    name: nameInput.value.trim(),
    email: emailInput.value.trim(),
  };

  var response = await fetch("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    try {
      var bad = await response.json();
      formErr.textContent = bad.error || "Could not save.";
    } catch (ignored) {
      formErr.textContent = "Could not save.";
    }
    formErr.hidden = false;
    return;
  }

  nameInput.value = "";
  emailInput.value = "";
  await loadUsers();
});

loadUsers();
