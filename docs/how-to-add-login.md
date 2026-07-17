# How to add a simple login page

This guide shows the **simplest** way to add a login page to this project.

You will use:

- A new HTML page (`login.html`)
- Two small JavaScript files in `public/js/`
- One new API route in `server.js`
- A `password` column on the `users` table (stored as **plain text** — fine for learning, not for real apps)
- **`localStorage`** in the browser to remember who is logged in

This is **not** secure. It is for learning how login *feels* in a web app. Real sites use hashing, HTTPS, sessions, and much more.

---

## Big picture

```text
1. User opens login.html and types email + password
2. login.js sends POST /api/login to server.js
3. Server checks email + password in SQLite
4. If OK, login.js saves the user in localStorage and goes to index.html
5. On other pages, auth.js checks localStorage — if missing, send user back to login.html
6. Logout clears localStorage
```

**Why localStorage?**

The server does not automatically “remember” you between page loads in this starter project. After a successful login, the browser stores something like:

```text
logged in as alice@example.com
```

in `localStorage`. Every protected page reads that on load.

**Why plain text passwords?**

So you can compare with a simple SQL query:

```sql
SELECT ... WHERE email = ? AND password = ?
```

No extra libraries. Again: **only for class demos.**

---

## Files you will add or change

| File | What it does |
| ---- | ------------ |
| `scripts/init-db.js` | Add `password` column; seed sample passwords |
| `server.js` | Add `POST /api/login` |
| `public/login.html` | Login form |
| `public/js/login.js` | Handle form submit, call API, save to localStorage |
| `public/js/auth.js` | Shared helpers: am I logged in? logout; redirect if not |
| `public/index.html` (and other pages) | Load `auth.js` and call `requireLogin()` |
| `public/css/login.css` (optional) | Small styles for the login page |

Keep **new** browser logic in **`login.js`** and **`auth.js`**. Do not put everything in one giant file.

---

## Step 1 — Add a password column

In `scripts/init-db.js`, change the `CREATE TABLE` so each user has a password:

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
)
```

When you seed users, include a password for each row. Example:

```js
const users = [
  ["Alice Carter", "alice@example.com", "password1"],
  ["Bob Singh", "bob@example.com", "password2"],
  // ...
];
```

Update the `INSERT` to match:

```js
const insert = db.prepare(
  "INSERT INTO users (name, email, password) VALUES (?, ?, ?)"
);
```

Run:

```bash
npm run init-db
```

**If you already had a database file** from before this change, either delete the `.sqlite` file and run `init-db` again, or run a one-off `ALTER TABLE` in the SQL console. For class work, re-running `init-db` is usually easiest.

---

## Step 2 — Login API on the server

In `server.js`, add a route **after** your other `/api/users` routes:

```js
// Simple login: body { "email": "...", "password": "..." }
app.post("/api/login", (req, res) => {
  try {
    const email = String(req.body?.email ?? "").trim();
    const password = String(req.body?.password ?? "");

    if (!email || !password) {
      return res.status(400).json({ error: "email and password required" });
    }

    const db = getDb();
    const row = db
      .prepare(
        "SELECT id, name, email FROM users WHERE email = ? AND password = ?"
      )
      .get(email, password);

    if (!row) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Do not send the password back to the browser
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: String(e.message) });
  }
});
```

| Status | Meaning |
| ------ | ------- |
| 200 | Login worked — body is `{ id, name, email }` |
| 400 | Missing email or password |
| 401 | Wrong email or password |
| 500 | Server/database error |

Restart the server after editing `server.js` (`npm start`).

---

## Step 3 — `login.html`

Create `public/login.html`. Reuse the same nav and CSS as other pages:

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Login</title>
    <link rel="stylesheet" href="/css/common.css" />
    <link rel="stylesheet" href="/css/login.css" />
  </head>
  <body>
    <nav>
      <a href="/">Users</a>
      <a href="/login.html">Login</a>
    </nav>

    <h1>Login</h1>

    <form id="loginForm">
      <div class="field">
        <span class="field-label">Email</span>
        <input
          id="loginEmail"
          class="field-input"
          type="email"
          required
          autocomplete="username"
        />
      </div>
      <div class="field">
        <span class="field-label">Password</span>
        <input
          id="loginPassword"
          class="field-input"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>
      <p class="form-actions">
        <button type="submit" class="primary">Log in</button>
      </p>
      <p id="loginErr" class="err" hidden></p>
    </form>

    <script src="/js/auth.js" defer></script>
    <script src="/js/login.js" defer></script>
  </body>
</html>
```

Load **`auth.js` before `login.js`** so shared helpers exist first.

---

## Step 4 — `public/js/auth.js` (localStorage + guard)

This file is shared by every page that cares about login.

```js
/**
 * auth.js — remember who is logged in (localStorage) and protect pages.
 */

var STORAGE_KEY = "simplesql_logged_in_user";

/** Save user object { id, name, email } after successful login */
function setLoggedInUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
}

/** Read saved user, or null if not logged in */
function getLoggedInUser() {
  var raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (ignored) {
    return null;
  }
}

/** Clear login (logout) */
function clearLoggedInUser() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * Call on pages that require login (e.g. index.html).
 * If nobody is logged in, go to login.html.
 */
function requireLogin() {
  if (!getLoggedInUser()) {
    window.location.href = "/login.html";
  }
}

/**
 * Optional: call on login.html so logged-in people skip the form.
 */
function redirectIfAlreadyLoggedIn() {
  if (getLoggedInUser()) {
    window.location.href = "/";
  }
}
```

**What is `localStorage`?**

It is a small key–value store inside the browser. It stays until you clear it or call `removeItem`. It is **only on this computer and this browser** — not shared with other students’ laptops.

---

## Step 5 — `public/js/login.js` (form + fetch)

```js
/**
 * login.js — login form only. Talks to POST /api/login.
 */

var loginForm = document.getElementById("loginForm");
var loginEmail = document.getElementById("loginEmail");
var loginPassword = document.getElementById("loginPassword");
var loginErr = document.getElementById("loginErr");

// If already logged in, no need to show this page
redirectIfAlreadyLoggedIn();

loginForm.addEventListener("submit", async function (evt) {
  evt.preventDefault();
  loginErr.hidden = true;

  var payload = {
    email: loginEmail.value.trim(),
    password: loginPassword.value,
  };

  var response = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  var bodyText = await response.text();

  if (!response.ok) {
    try {
      var bad = JSON.parse(bodyText);
      loginErr.textContent = bad.error || "Login failed.";
    } catch (ignored) {
      loginErr.textContent = "Login failed.";
    }
    loginErr.hidden = false;
    return;
  }

  var user = JSON.parse(bodyText);
  setLoggedInUser(user);
  window.location.href = "/";
});
```

Test with a seeded user, e.g. `alice@example.com` / `password1`.

---

## Step 6 — Protect other pages

On `index.html` (and any page you want hidden until login), add **`auth.js`** and one line at the bottom:

```html
<script src="/js/auth.js" defer></script>
<script src="/js/users.js" defer></script>
```

At the **top** of `users.js` (after you have the element variables), add:

```js
requireLogin();
```

Do the same pattern on `sql.html`, `upload.html`, and `explore.html` if those should also require login.

---

## Step 7 — Show who is logged in + Logout

Add a small line to your nav in `index.html`:

```html
<p id="whoAmI"></p>
<button type="button" id="logoutBtn">Log out</button>
```

At the bottom of `users.js` (or a tiny `public/js/logout.js` if you prefer another file):

```js
var whoAmI = document.getElementById("whoAmI");
var logoutBtn = document.getElementById("logoutBtn");

if (whoAmI) {
  var me = getLoggedInUser();
  if (me) {
    whoAmI.textContent = "Logged in as " + me.name + " (" + me.email + ")";
  }
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", function () {
    clearLoggedInUser();
    window.location.href = "/login.html";
  });
}
```

---

## Optional — `public/css/login.css`

Keep it minimal; `common.css` already styles forms:

```css
#loginForm {
  max-width: 24rem;
}
```

---

## How to test

1. `npm run init-db`
2. `npm start`
3. Open `http://localhost:3000/login.html`
4. Wrong password → error message on the page
5. Correct password → redirect to `/`
6. Refresh `/` → still logged in (localStorage)
7. Click **Log out** → back to login; `/` should redirect to login again

Use **DevTools → Application → Local Storage** to see `simplesql_logged_in_user`.

Use **DevTools → Network** to see `POST /api/login`.

---

## Common problems

| Problem | What to check |
| ------- | ------------- |
| Login always fails | Did you run `init-db` after adding `password`? Do email/password match seed data? |
| Redirect loop | `requireLogin()` on `login.html` without `redirectIfAlreadyLoggedIn()` — use the right helper on each page |
| `getLoggedInUser is not defined` | Load `auth.js` before other scripts |
| 404 on `/js/login.js` | File must live in `public/js/` |
| Still see Users page when “logged out” | `requireLogin()` not called on that page’s script |

---

## What this does *not* do (on purpose)

- Passwords are **not** hashed
- Login state is **only** in the browser (`localStorage`) — someone could edit it in DevTools
- There is no server-side “session cookie”
- Closing the browser does **not** log you out (localStorage stays)

That is OK for learning. For a real product you would learn proper authentication later.

---

## Summary

| Piece | Role |
| ----- | ---- |
| SQLite `password` column | Store passwords in plain text for demo |
| `POST /api/login` | Server checks email + password |
| `login.js` | Form → fetch → save user → redirect |
| `auth.js` | `localStorage` helpers + `requireLogin()` |
| `localStorage` | Remember who is logged in between page loads |

That is the simplest login flow that still matches how this app is built: **HTML + separate JS files + `fetch` + SQLite**.
