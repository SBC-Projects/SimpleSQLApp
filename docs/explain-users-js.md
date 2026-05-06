# Understanding `public/js/users.js`

This guide explains what `public/js/users.js` does in a simple way.

This file runs in the browser.

It helps the Users page:

- load users from the server
- show users in a table
- add a new user
- edit an existing user
- delete a user
- show error messages when something goes wrong

The `server.js` file runs on the server.

The `users.js` file runs in the browser.

Together, they make the web app work.

---

## 1. How this file runs

In `index.html`, there is a line like this:

```html
<script src="/js/users.js" defer></script>
```

This tells the browser:

```text
Load the JavaScript file called users.js.
```

The `defer` part means:

```text
Wait until the HTML page has loaded before running this script.
```

This is useful because the JavaScript needs to find things on the page, like buttons, inputs, and the table.

If the JavaScript ran too early, those things might not exist yet.

At the bottom of the file, there is a call to:

```js
loadUsers();
```

That starts the first load of the user list.

---

## 2. Getting HTML elements with `document.getElementById`

The JavaScript needs to connect to parts of the HTML page.

Example:

```js
var tableWrap = document.getElementById("tableWrap");
```

This means:

```text
Find the HTML element that has id="tableWrap".
```

In the HTML, there might be something like:

```html
<div id="tableWrap"></div>
```

The JavaScript can then change what is inside that `div`.

This is how the script updates the page.

---

## 3. Why the names must match

If the HTML has this:

```html
<div id="tableWrap"></div>
```

then the JavaScript must use the same id:

```js
document.getElementById("tableWrap");
```

If you rename the id in the HTML, you must also rename it in the JavaScript.

Otherwise, the JavaScript will not find the element.

---

## 4. What is the DOM?

DOM means Document Object Model.

That sounds complicated, but it just means:

```text
The browser's JavaScript version of the HTML page.
```

JavaScript can use the DOM to:

- read parts of the page
- change text
- change HTML
- react to clicks
- add or remove content

When `users.js` changes the table, it is changing the DOM.

---

## 5. `escapeHtml`

The file has a helper function called:

```js
escapeHtml
```

This function makes text safer before putting it into HTML.

For example, imagine a user enters this as their name:

```text
Amy">click me
```

That text has special characters in it.

If we put that straight into HTML, it could break the page.

`escapeHtml` changes special characters into safer versions.

For example:

| Character | Safe version |
| --------- | ------------ |
| `&` | `&amp;` |
| `<` | `&lt;` |
| `>` | `&gt;` |
| `"` | `&quot;` |

This helps stop user text from becoming broken HTML.

It also helps protect the page from unsafe input.

---

## 6. What is `fetch`?

`fetch` lets browser JavaScript talk to the server.

Example:

```js
fetch("/api/users");
```

This sends a request to the server.

The server can then send data back.

In this project, `fetch` is used to talk to routes in `server.js`.

For example:

| Browser code | Server route |
| ------------ | ------------ |
| `fetch("/api/users")` | `GET /api/users` |
| `fetch("/api/users", { method: "POST" })` | `POST /api/users` |
| `fetch("/api/users/5", { method: "PUT" })` | `PUT /api/users/5` |
| `fetch("/api/users/5", { method: "DELETE" })` | `DELETE /api/users/5` |

---

## 7. What does `async` mean?

Some code takes time.

For example, getting data from the server can take a moment.

An `async` function lets us use `await`.

Example:

```js
async function loadUsers() {
  const response = await fetch("/api/users");
}
```

The word `await` means:

```text
Wait for this job to finish before moving to the next line.
```

This makes the code easier to read.

---

## 8. Loading users with `GET /api/users`

The `loadUsers` function asks the server for the list of users.

It uses:

```js
fetch("/api/users");
```

This is a GET request.

GET means:

```text
Please send me some information.
```

The server sends back a list of users.

Then the script uses:

```js
drawTable(users);
```

to show those users on the page.

---

## 9. Reading the server response

The browser gets a response from the server.

The code can read the response body as text:

```js
const text = await response.text();
```

Even JSON is sent as text first.

Then the code can turn that text into real JavaScript data:

```js
const users = JSON.parse(text);
```

For example, this JSON text:

```json
[
  { "id": 1, "name": "Ada", "email": "ada@example.com" }
]
```

can become a JavaScript array.

---

## 10. `response.ok`

The code checks:

```js
response.ok
```

This tells us whether the request worked.

If `response.ok` is true, the request was successful.

If it is false, something went wrong.

For example:

| Status code | Meaning |
| ----------- | ------- |
| 200 | OK |
| 400 | Bad request |
| 404 | Not found |
| 409 | Conflict |
| 500 | Server error |

If something goes wrong, the script shows an error message on the page.

---

## 11. Adding a user with `POST /api/users`

When someone fills in the form and clicks Add, the browser sends a POST request.

POST usually means:

```text
Add something new.
```

Example:

```js
fetch("/api/users", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});
```

This sends the new user to the server.

---

## 12. `Content-Type`

This part is important:

```js
headers: { "Content-Type": "application/json" }
```

It tells the server:

```text
The body of this request is JSON.
```

The server needs this so `express.json()` can read the data properly.

---

## 13. `JSON.stringify`

JavaScript objects are not sent directly over HTTP.

They need to be turned into text first.

This line does that:

```js
JSON.stringify(payload)
```

For example, this JavaScript object:

```js
{
  name: "Jamie",
  email: "jamie@school.edu"
}
```

becomes this JSON text:

```json
{
  "name": "Jamie",
  "email": "jamie@school.edu"
}
```

That text is sent to the server.

---

## 14. What happens after adding a user?

If the user is added successfully, the script clears the form inputs.

Then it calls:

```js
loadUsers();
```

This reloads the user list from the server.

That way, the table shows the newest data.

---

## 15. Updating a user with `PUT /api/users/:id`

PUT usually means:

```text
Update something that already exists.
```

Example:

```js
fetch("/api/users/" + id, {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload)
});
```

If the id is `5`, the URL becomes:

```text
/api/users/5
```

That tells the server which user to update.

The updated name and email are sent in the request body.

---

## 16. Getting the id from a button

Each Save or Delete button stores the user id.

It may use an attribute like this:

```html
<button data-id="5">Save</button>
```

The JavaScript can read that id with:

```js
saveButton.getAttribute("data-id");
```

This tells the script which user the button belongs to.

The id from the DOM is usually a string.

---

## 17. Deleting a user with `DELETE /api/users/:id`

DELETE means:

```text
Remove something.
```

Example:

```js
fetch("/api/users/5", {
  method: "DELETE"
});
```

This asks the server to delete the user with id 5.

If it works, the server returns:

```text
204 No Content
```

---

## 18. Why 204 is special

A 204 response means:

```text
The request worked, but there is no data to send back.
```

So this can cause an error:

```js
response.json();
```

Why?

Because there is no JSON body to read.

That is why the code checks:

```js
if (response.status === 204) {
  await loadUsers();
}
```

The code reloads the table, but does not try to read JSON.

---

## 19. `drawTable(users)`

The `drawTable` function shows users on the page.

It receives an array of users.

Example:

```js
[
  { id: 1, name: "Ada", email: "ada@example.com" },
  { id: 2, name: "Jamie", email: "jamie@school.edu" }
]
```

Then it builds HTML for a table.

The code adds rows to a string.

At the end, it puts the HTML into the page with:

```js
tableWrap.innerHTML = html;
```

That changes what the user sees.

---

## 20. `innerHTML`

`innerHTML` lets JavaScript replace the HTML inside an element.

Example:

```js
tableWrap.innerHTML = html;
```

This means:

```text
Put this new HTML inside tableWrap.
```

This is useful for a small learning project.

But you must be careful.

If user text is placed into HTML, it should be cleaned with `escapeHtml`.

---

## 21. Save and Delete buttons

Each row in the table has buttons.

For example:

```text
Save
Delete
```

The buttons have classes so the JavaScript knows what they do.

| Class | Meaning |
| ----- | ------- |
| `row-save` | Save changes for this row |
| `delete-btn` | Delete this user |

The code does not just rely on the button text.

It checks the class.

That is more reliable.

---

## 22. `addEventListener`

`addEventListener` tells JavaScript to listen for something.

Example:

```js
tableWrap.addEventListener("click", handler);
```

This means:

```text
When someone clicks inside tableWrap, run handler.
```

The page can then respond when the user clicks Save or Delete.

---

## 23. What is `evt.target`?

When a click happens, JavaScript gives us an event object.

It is often called:

```js
evt
```

The clicked thing is:

```js
evt.target
```

For example, if someone clicks a Delete button, `evt.target` is that button.

The code checks if the clicked thing was a button.

If it was not a button, the code stops.

---

## 24. Event delegation

The script listens for clicks on `tableWrap`, not on every single button.

This is called event delegation.

It is useful because the table is redrawn many times.

When `innerHTML` changes, old buttons are removed and new buttons are created.

If we added click listeners to every old button, those listeners would disappear when the table redraws.

But `tableWrap` stays on the page.

So listening on `tableWrap` keeps working.

---

## 25. Form submit

The Add User form listens for a submit event.

A form can submit when:

- the user clicks the Add button
- the user presses Enter in an input box

The code uses:

```js
evt.preventDefault();
```

This stops the browser from doing a normal page reload.

Instead, the script uses `fetch` to send the data.

That keeps the page feeling smoother.

---

## 26. Finding the row for Save

When the user clicks Save, the code needs to find the inputs in that same row.

The Save button is inside a table cell.

That table cell is inside a table row.

So the code can move up the DOM from the button to the row.

Then it finds inputs inside that row, such as:

```js
.row-name
.row-email
```

This makes sure it saves the correct user.

---

## 27. Common problems

| Problem | Possible cause |
| ------- | -------------- |
| `/js/users.js` gives 404 | The script path is wrong, or the file is not in `public/js/` |
| Users do not load | The server may not be running |
| Wrong port | The browser and server might not both be using port 3000 |
| Duplicate email error | The database may not allow two users with the same email |
| Delete causes JSON error | A 204 response has no JSON body |

---

## 28. Using browser DevTools

Browser DevTools can help you debug.

Open DevTools, then look at the Network tab.

There you can see requests like:

```text
GET /api/users
POST /api/users
PUT /api/users/5
DELETE /api/users/5
```

This helps you check:

- what request was sent
- what status code came back
- what data was returned
- whether an error happened

---

## 29. Main idea

The `users.js` file connects the page to the server.

The basic flow is:

```text
User clicks or types
        ↓
users.js runs
        ↓
fetch sends a request to server.js
        ↓
server.js talks to the database
        ↓
server.js sends a response
        ↓
users.js updates the page
```

That is how the Users page works.