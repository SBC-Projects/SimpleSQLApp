# Understanding `server.js`

This guide explains what `server.js` does in a simple way.

The `server.js` file runs the web server for this project. It lets the website talk to the database.

It handles things like:

- showing files from the `public` folder
- receiving requests from the browser
- sending responses back
- adding, reading, updating, and deleting users
- running SQL commands for practice

---

## 1. What is Express?

Express is a tool that helps us make a web server using JavaScript.

A web server is a program that waits for requests from a browser.

For example, when someone visits:

```text
http://localhost:3000
```

the browser sends a request to the server.

Express helps decide what should happen next.

---

## 2. `const app = express()`

This line creates the server app:

```js
const app = express();
```

You can think of `app` as the main server object.

We use `app` to tell the server what to do.

For example:

```js
app.get(...)
app.post(...)
app.put(...)
app.delete(...)
```

These lines tell the server how to respond to different requests.

Later, this line starts the server:

```js
app.listen(3000, ...)
```

That means:

```text
Start the server on port 3000.
```

A port is like a door number for the server.

---

## 3. `app.use(...)`

`app.use(...)` sets up code that should run before the main routes.

This is often used for setup jobs.

---

## 3a. Reading JSON with `express.json`

```js
app.use(express.json({ limit: "25mb" }));
```

This line lets the server read JSON sent from the browser.

JSON looks like this:

```json
{
  "name": "Ada",
  "email": "ada@example.com"
}
```

Without this line, the server would not understand the JSON properly.

After Express reads the JSON, it puts it inside:

```js
req.body
```

So if the browser sends this:

```json
{
  "name": "Ada",
  "email": "ada@example.com"
}
```

the server can use:

```js
req.body.name
req.body.email
```

That gives:

```js
"Ada"
"ada@example.com"
```

The `limit: "25mb"` part caps how large a JSON body can be. It is set higher than usual because the **Excel upload** page sends the spreadsheet as base64 inside JSON (see `lib/excel-upload.js` and `POST /api/upload/preview`).

---

## 3b. Showing files from the `public` folder

```js
app.use(express.static(path.join(__dirname, "public")));
```

This line lets Express automatically send files from the `public` folder.

For example, the browser might ask for:

```text
/index.html
/css/common.css
/js/users.js
```

If those files are inside `public`, Express can send them back.

`__dirname` means:

```text
the folder where server.js is located
```

So this line points Express to the `public` folder next to `server.js`.

---

## 4. Routes

A route tells the server what to do when a browser asks for a certain URL.

Example:

```js
app.get("/api/users", (req, res) => {
  // code goes here
});
```

This means:

```text
When the browser sends a GET request to /api/users, run this function.
```

Routes usually have two main parts:

```js
req
res
```

`req` means request.

`res` means response.

---

## 5. HTTP methods

The project uses these HTTP methods:

| Method | Simple meaning | Example |
| ------ | -------------- | ------- |
| GET | Get information | Get all users |
| POST | Add something new | Add a new user |
| PUT | Update something | Change a user |
| DELETE | Delete something | Remove a user |

---

## 6. `req`: the request

`req` contains information sent from the browser to the server.

It can include things like:

| Part | What it means |
| ---- | ------------- |
| `req.params` | Values from the URL |
| `req.body` | JSON data sent by the browser |
| `req.method` | The method, like GET or POST |

---

## 7. `req.params`

Sometimes a route has a value inside the URL.

Example:

```js
app.get("/api/users/:id", (req, res) => {
  // code goes here
});
```

The `:id` part is a placeholder.

If the browser asks for:

```text
/api/users/7
```

then:

```js
req.params.id
```

will be:

```js
"7"
```

Notice that it is usually a string, not a number.

---

## 8. `req.body`

`req.body` contains JSON data sent from the browser.

This is mostly used with POST and PUT.

Example:

```js
fetch("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Jamie",
    email: "jamie@school.edu"
  })
});
```

The server can then read:

```js
req.body.name
req.body.email
```

That gives:

```js
"Jamie"
"jamie@school.edu"
```

---

## 9. `res`: the response

`res` is how the server sends something back to the browser.

Common examples:

```js
res.json(data)
```

This sends JSON back.

```js
res.status(404).json({ error: "Not found" })
```

This sends an error message with a 404 status code.

```js
res.status(204).end()
```

This means the request worked, but there is no data to send back.

---

## 10. Common status codes

Status codes tell the browser what happened.

| Code | Meaning |
| ---- | ------- |
| 200 | OK |
| 201 | Created |
| 400 | Bad request |
| 404 | Not found |
| 409 | Conflict |
| 500 | Server error |

Examples:

A 200 means:

```text
Everything worked.
```

A 404 means:

```text
The thing you asked for could not be found.
```

A 500 means:

```text
Something went wrong on the server.
```

---

## 11. GET `/api/users`

This route gets all users from the database.

It usually uses SQL like:

```sql
SELECT id, name, email, created_at FROM users ORDER BY id
```

The server sends the users back as JSON.

Example result:

```json
[
  {
    "id": 1,
    "name": "Ada",
    "email": "ada@example.com"
  },
  {
    "id": 2,
    "name": "Jamie",
    "email": "jamie@school.edu"
  }
]
```

---

## 12. GET `/api/users/:id`

This route gets one user by their id.

Example request:

```text
/api/users/5
```

The server reads:

```js
req.params.id
```

If a user with id 5 exists, the server sends that user back.

If not, it sends a 404 error.

---

## 13. POST `/api/users`

This route adds a new user.

The browser sends JSON like this:

```json
{
  "name": "Jamie",
  "email": "jamie@school.edu"
}
```

The server reads the data from:

```js
req.body
```

Then it adds the user to the database.

If it works, the server sends back status code:

```text
201 Created
```

That means a new user was created.

---

## 14. PUT `/api/users/:id`

This route updates an existing user.

Example request:

```text
PUT /api/users/3
```

The browser might send:

```json
{
  "name": "Jamie Lee",
  "email": "jamie@school.edu"
}
```

The server uses:

```js
req.params.id
```

to know which user to update.

It uses:

```js
req.body
```

to get the new name and email.

If the user does not exist, the server sends a 404 error.

---

## 15. DELETE `/api/users/:id`

This route deletes a user.

Example:

```js
fetch("/api/users/5", {
  method: "DELETE"
});
```

This asks the server to delete the user with id 5.

If the delete works, the server sends:

```text
204 No Content
```

That means:

```text
The delete worked, but there is nothing else to send back.
```

Because there is no response body, calling `response.json()` may cause an error.

That is normal for a 204 response.

---

## 16. SQLite helpers

The server talks to an SQLite database.

SQLite is a small database that stores data in a file.

The code uses these helpers:

```js
.all()
.get()
.run()
```

They do different jobs.

---

## 17. `.all()`

Use `.all()` when you expect many rows.

Example:

```js
const rows = db
  .prepare("SELECT id, name, email FROM users")
  .all();
```

This gives an array.

Example:

```js
[
  { id: 1, name: "Ada", email: "ada@example.com" },
  { id: 2, name: "Jamie", email: "jamie@school.edu" }
]
```

Use `.all()` for a list of results.

---

## 18. `.get()`

Use `.get()` when you expect one row.

Example:

```js
const row = db
  .prepare("SELECT id, name, email FROM users WHERE id = ?")
  .get(req.params.id);
```

This gives one object.

Example:

```js
{
  id: 5,
  name: "Jamie",
  email: "jamie@school.edu"
}
```

If no row is found, it gives:

```js
undefined
```

---

## 19. `.run()`

Use `.run()` when you are changing the database.

For example:

```sql
INSERT
UPDATE
DELETE
```

Example:

```js
const info = db
  .prepare("DELETE FROM users WHERE id = ?")
  .run(req.params.id);
```

The result can tell us how many rows were changed.

Example:

```js
info.changes
```

If `info.changes` is 0, then nothing was deleted.

That probably means the user id did not exist.

---

## 20. Do not mix up GET and `.get()`

These two things sound similar, but they are different.

| Word | Meaning |
| ---- | ------- |
| HTTP GET | A browser asks the server for information |
| SQLite `.get()` | The database gives back one row |

They are not the same thing.

---

## 20a. Excel upload (`lib/excel-upload.js`)

The upload page (`/upload.html`) does not put all the Excel logic inside `server.js`.

Instead, `server.js` calls:

```js
import { registerExcelUploadRoutes } from "./lib/excel-upload.js";

registerExcelUploadRoutes(app);
```

That function registers three JSON routes:

| Route | Role |
| ----- | ---- |
| `POST /api/upload/preview` | First pass: read the `.xlsx`, guess column names and types, return sample rows and a suggested `CREATE TABLE` string. |
| `POST /api/upload/create-table` | Run the `CREATE TABLE` the student confirmed (empty table). |
| `POST /api/upload/import` | Second pass: insert all data rows. |

The server keeps a short-lived in-memory map of parsed uploads (by `uploadId`) between preview and import so the browser does not have to send the whole file again.

---

## 21. POST `/api/sql`

This route lets the user run SQL commands.

The browser sends something like:

```json
{
  "sql": "SELECT COUNT(*) AS n FROM users;"
}
```

The server reads:

```js
req.body.sql
```

If the SQL returns rows, the server uses:

```js
.all()
```

If the SQL changes the database, the server uses:

```js
.run()
```

This route is useful for learning SQL.

But it is also powerful.

Do not put this kind of route on a real public website.

Someone could use it to damage or steal data.

---

## 22. `app.listen`

This starts the server.

Example:

```js
const server = app.listen(port, () => {
  console.log(`http://localhost:${port}`);
});
```

This means:

```text
Start listening for requests.
```

When the server starts successfully, it prints the local website address.

Usually that is:

```text
http://localhost:3000
```

---

## 23. Server errors

Sometimes the server cannot start.

For example, another program might already be using port 3000.

That error is called:

```text
EADDRINUSE
```

It means:

```text
This address is already in use.
```

The code listens for server errors so it can show a helpful message.

---

## 24. Main idea

The `server.js` file connects three things:

```text
browser  →  Express server  →  SQLite database
```

The browser sends a request.

Express decides which route should handle it.

The route may ask SQLite for data.

Then Express sends a response back to the browser.

That is the basic flow of the whole file.