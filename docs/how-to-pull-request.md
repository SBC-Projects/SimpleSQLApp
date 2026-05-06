# Contribute changes with a pull request (fork workflow)

Because only certain accounts can push directly to **`SBC-Projects/SimpleSQLApp`**, the usual workflow is:

1. **Fork** that repo under your GitHub user (already described in **`README.md`**).
2. **Push your commit** from your laptop to **your fork** (you have permission there).
3. Open a **pull request on GitHub** so maintainers can **merge** your branch into **`SBC-Projects/SimpleSQLApp`**.

Upstream repo (read-only unless you’re a maintainer):

[github.com/SBC-Projects/SimpleSQLApp](https://github.com/SBC-Projects/SimpleSQLApp)

---

## 1. Fork on GitHub

On the **`SBC-Projects/SimpleSQLApp`** repo page:

- Click **Fork** (top-right).
- Your fork ends up like: **`https://github.com/YOUR_USERNAME/SimpleSQLApp`**.

Replace **`YOUR_USERNAME`** below with your real GitHub login.

---

## 2. Push your local project to **your fork**

If your computer already has the code and **`main`** branch with commits, configure **two remotes**:

| Remote name | URL | Typical use |
|-------------|-----|--------------|
| **`upstream`** | `https://github.com/SBC-Projects/SimpleSQLApp.git` | Pull official updates later |
| **`origin`** | `https://github.com/YOUR_USERNAME/SimpleSQLApp.git` | **Push here** |

From your project folder in a terminal (`SimpleSql` locally):

```bash
git remote rename origin upstream
git remote add origin https://github.com/YOUR_USERNAME/SimpleSQLApp.git
git push -u origin main
```

- First line renames whatever **`origin`** was (often mistakenly set only to **`SBC-Projects`**) → **`upstream`**.
- **`git push origin main`** should succeed against **your** fork (authenticate with PAT or SSO as GitHub prompts).

If you deliberately want **`origin` = SBC Projects** instead, skip renaming and **add** another name:

```bash
git remote add myfork https://github.com/YOUR_USERNAME/SimpleSQLApp.git
git push -u myfork main
```

Either pattern is fine; you only need one place you **can push** (`origin` vs **`myfork`**) plus one place official code lives (**`upstream`**).

---

## 3. Open the pull request in the browser

1. Push finishes → GitHub often shows **“Compare & pull request”** on **`your fork`**’s homepage. Click it **or**:

2. Open **`upstream`**: **[SBC-Projects/SimpleSQLApp](https://github.com/SBC-Projects/SimpleSQLApp)**

3. **Pull requests** tab → **New pull request**.

4. Set **base** repo to **`SBC-Projects/SimpleSQLApp`** and branch **`main`**.

   Set **compare** repo to **`YOUR_USERNAME/SimpleSQLApp`** branch **`main`**.

5. Fill title/description → **Create pull request**.

Maintainers merge when ready—that **lands your commits into the org repo** without everyone needing push access.

---

## Optional later: stay in sync with upstream

```bash
git fetch upstream
git merge upstream/main    # or: git rebase upstream/main
git push origin main       # refresh your fork
```

---

## Optional: GitHub CLI

If you install **[GitHub CLI](https://cli.github.com/)** (**`gh`**) and run **`gh auth login`**, you can draft a PR without clicking as much:

```bash
git push -u origin main
gh pr create --repo SBC-Projects/SimpleSQLApp --base main --head YOUR_USERNAME:main --title "Add SimpleSQL classroom app" --body "Initial import from local workspace."
```

`--head` must name **fork owner** and branch GitHub sees (often **`USERNAME:branch`**).
