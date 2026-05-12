# SimpleSQLApp

A small classroom demo: **one web server** ([Express](https://expressjs.com/)) talks to **one SQLite database file**—no separate database server to install.

Students can:

1. Browse and change **users** in the browser (add people, edit names and emails in the table, delete rows).
2. Open an **SQL console** page where typed queries run against the **same database**—useful for learning SQL syntax. **Quick insert** buttons drop common snippets (for example listing tables, `PRAGMA foreign_keys = ON`, and sample `users` queries). **Never put that page on the public internet**; it runs whatever SQL the user enters.
3. Upload an **`.xlsx`** file on **`/upload.html`**, review suggested column names / types / primary keys, copy the `CREATE TABLE` SQL for assignments, then create the table and import rows in two steps.

**Home repository:** [github.com/SBC-Projects/SimpleSQLApp](https://github.com/SBC-Projects/SimpleSQLApp)

Got the code locally but **can’t push straight to SBC-Projects**? Use **your fork + a pull request** — see **[docs/how-to-pull-request.md](docs/how-to-pull-request.md)**.

Configuration (web port and database file path) is **coded in the repo** (`server.js` and `lib/db.js`) so there are no `.env` files for beginners to configure.

---

## Run it with GitHub Codespaces

If you are reading this README on GitHub right now, you are already looking at this project online.

### 1. Fork it into your GitHub account

At the **top-right of this page**, click **[Fork]** and finish the short prompts. GitHub saves **your own copy**; your fork stays linked back to **SBC-Projects**.

### 2. Open **your fork** on GitHub (use your repo: `https://github.com/YOUR_USERNAME/SimpleSQLApp`)

### 3. Start a Codespace from your fork

On **your fork’s** GitHub page:

1. Click the green **[Code]** button.
2. Open the **[Codespaces](https://docs.github.com/en/codespaces/developing-in-a-codespace/creating-a-codespace-for-a-repository)** tab.
3. Click **Create codespace on main** (or your default branch). Wait until the browser editor and terminal finish loading.

### 4. In the Codespace terminal

```bash
npm install
npm run init-db
npm start
```

When the server is running:

- Codespaces forwards port **3000**. Open the **Ports** panel (often in the bottom area), find **3000**, and use **Open in browser** — or click the forwarded URL GitHub suggests.
- The app listens on **port 3000** by default (defined in **`server.js`**). SQLite uses **`data/simplesql.db`** (see **`lib/db.js`**).

If port **3000** is blocked or busy inside the sandbox, edit **`server.js`** and change the line `const port = 3000;` near the top.

---

## Run it on your own computer (instead of Codespaces)

You need **Node.js 22.5+** (from [nodejs.org](https://nodejs.org/)).

```bash
git clone https://github.com/YOUR_USERNAME/SimpleSQLApp.git
cd SimpleSQLApp
npm install
npm run init-db
npm start
```

Then open **http://localhost:3000**. Home page **`/`** is the users table; **`/sql.html`** is the SQL practice page; **`/upload.html`** imports Excel sheets.

---

## How the folders fit together

| Path | Purpose |
|------|--------|
| `server.js` | HTTP server + `/api/*` routes (JSON APIs and static files). |
| `lib/db.js` | Opens the SQLite file using Node’s **`node:sqlite`** module (no extra drivers). |
| `lib/excel-upload.js` | Excel preview / create-table / import routes used by **`/upload.html`**. |
| `scripts/init-db.js` | Creates the schema + seeds dummy users (**`npm run init-db`**). |
| `public/` | Static files for the browser: HTML, **`css/`**, **`js/`**. |
| `data/` | Where **`simplesql.db`** ends up after you run `npm run init-db`. |

**Explainers:**

- [docs/explain-server.md](docs/explain-server.md) — **`server.js`**: **`app.use`**, **`req`** / **`res`**, **`req.body`**, HTTP methods, SQLite **`get`** / **`run`** / **`all`**.
- [docs/explain-users-js.md](docs/explain-users-js.md) — **`public/js/users.js`**: **`fetch`**, **`async`/`await`**, building tables, delegated clicks vs form submit event.

---

## Teaching notes

SQLite is intentionally **simple for school labs**: everything is **one local file**. The SQL console illustrates real queries but shows why **trusted users only** matters—there is **no sandbox** beyond “whoever can reach the server.”
