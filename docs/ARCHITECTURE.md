# Architecture

Current as of step 5 (`step-5-error-handling`). Sections marked *(planned)* describe
work scheduled for later steps and do not exist in the code yet.

## Overview

A conventional layered Express + Mongoose backend. The entry point (`server.js`) is kept
separate from the Express app definition (`app.js`) so the app can be imported by tests
or tooling without opening a port or touching the database.

```mermaid
flowchart TD
    client([HTTP client])

    subgraph node["Node.js process"]
        server["src/server.js<br/>entry point"]
        app["src/app.js<br/>Express app"]
        db["src/config/db.js<br/>connectDB()"]
        models["src/models/<br/>User.js · Post.js"]
        routes["src/routes/<br/>postRoutes.js · authRoutes.js"]
        controllers["src/controllers/<br/>postController.js · authController.js"]
        middleware["src/middleware/<br/>requireAuth.js · notFound.js · errorHandler.js"]
        validators["src/validators/<br/>index.js"]
    end

    mongo[(MongoDB)]

    client -->|HTTP| app
    server --> app
    server --> db
    db --> mongo
    models --> mongo
    app --> routes
    routes --> middleware
    routes --> validators
    routes --> controllers
    controllers --> models
    controllers -.->|throw / next err| middleware
```

As of step 5 the full layering is live and every planned piece has landed: routes run
`requireAuth` and the express-validator chains before their controllers, the auth pair
(`/api/auth/register`, `/api/auth/login`) issues the JWTs the middleware verifies, and
every error — thrown from an async controller, passed to `next()`, or an unmatched
route — flows to the single `errorHandler` mounted last.

## Boot sequence

`server.js` refuses to listen until MongoDB is reachable — a fail-fast policy so a
misconfigured `MONGO_URI` surfaces immediately instead of as 500s under load.

```mermaid
sequenceDiagram
    participant N as node src/server.js
    participant D as dotenv
    participant C as connectDB()
    participant M as MongoDB
    participant E as Express app

    N->>D: config() — load .env
    N->>C: connectDB()
    C->>M: mongoose.connect(MONGO_URI)
    alt connection succeeds
        M-->>C: connected
        C-->>N: resolves ("MongoDB connected")
        N->>E: app.listen(PORT)
        E-->>N: "Server listening on port {PORT}"
    else connection fails
        M-->>C: error
        C->>N: process.exit(1)
    end
```

## Request flow

| Method | Route | Middleware chain | Response |
|--------|-------|------------------|----------|
| GET | `/health` | — (inline in `app.js`) | 200 `{"status":"ok"}` |
| POST | `/api/auth/register` | validation → `authController.register` | 201 `{ token, user }` / 400 / 409 |
| POST | `/api/auth/login` | validation → `authController.login` | 200 `{ token, user }` / 400 / 401 |
| GET | `/api/posts` | `postController.listPosts` | 200 `{ data, page, limit, total, totalPages }` |
| GET | `/api/posts/:id` | `postController.getPost` | 200 post (author populated) / 404 |
| POST | `/api/posts` | `requireAuth` → validation → `createPost` | 201 post / 400 / 401 |
| PUT | `/api/posts/:id` | `requireAuth` → validation → `updatePost` | 200 post / 400 / 401 / 403 / 404 |
| DELETE | `/api/posts/:id` | `requireAuth` → `deletePost` | 204 / 401 / 403 / 404 |

Protected routes run `requireAuth` first (a request without a valid
`Authorization: Bearer <token>` gets 401 before validation can leak anything), then
the express-validator chains with the shared `handleValidationErrors` collector, then
the controller. `requireAuth` verifies the JWT against `JWT_SECRET` and sets
`req.user = { id, role }` — the shape `assertCanMutate` consumes. Reads populate
`author` down to `username` and `email` only.

### Error path

Every error response is produced by one place: `src/middleware/errorHandler.js`,
mounted last in `app.js` (after `notFound`, after every route). Controllers no longer
catch anything themselves — Express 5 forwards a rejected promise from an `async`
handler to `next(err)` automatically, so a controller either returns a response or
`throw`s. Two kinds of throw reach the handler:

- **`AppError`** (`src/utils/AppError.js`) — status codes that are a decision this
  code makes: 401/403 on `assertCanMutate`, 404 on a missing post, 400 on a malformed
  `?author=` filter, 400 from `handleValidationErrors`, 401 from `requireAuth`.
- **Framework errors**, classified generically in the handler: Mongoose
  `ValidationError` → 400, `CastError` → 404 (unambiguous — see DESIGN.md), Mongo
  `11000` → 409, stray JWT errors → 401, anything else → 500 (never leaks
  `err.message` or a stack trace; logged server-side via `console.error`).

`requireAuth` is not `async`, so Express's auto-forwarding does not apply to it — it
keeps an explicit `try/catch` and calls `next(new AppError(...))` itself. Unmatched
routes hit `notFound`, which raises a 404 `AppError` so even `GET /api/nope` returns
the same JSON envelope instead of Express's default HTML error page.

Global middleware: `express.json()` (malformed JSON bodies are rejected with 400 by
Express's default error handling).

## Module responsibilities

| Module | Responsibility | Deliberately does NOT |
|--------|----------------|-----------------------|
| `src/server.js` | Load env, connect DB, start listening | Define routes or middleware |
| `src/app.js` | Assemble the Express app (middleware + routes), export it | Read env vars, open ports, or connect to the DB |
| `src/config/db.js` | Single `connectDB()` — connect or `process.exit(1)` | Retry/backoff (fail-fast is intentional at this stage) |
| `src/models/*.js` | Schema definitions, validation rules, indexes; `User.js` owns bcrypt hashing (pre-save hook) + `comparePassword` | Request handling or token issuing |
| `src/middleware/requireAuth.js` | Verify Bearer JWT, set `req.user { id, role }` | Ownership checks (controller's job) or token issuing |
| `src/middleware/notFound.js` | Turn an unmatched route into a 404 `AppError` | Match/validate routes (Express's router does that) |
| `src/middleware/errorHandler.js` | The one place that writes `{ error: {...} }` | Business logic — it only classifies and formats |
| `src/validators/index.js` | express-validator chains + shared 400 collector | Business rules; Mongoose validation remains the last line of defense |
| `src/controllers/authController.js` | Register/login, JWT signing, public user serialization | Password hashing (model's job), catching its own errors |
| `src/utils/AppError.js` | Throwable carrying `status`/`details` for deliberate error responses | Formatting the JSON envelope (handler's job) |

## Data model

Two collections, one relationship: `Post.author` is an `ObjectId` referencing `User`
(a reference, not an embedded subdocument). See [DESIGN.md](DESIGN.md) for field-level
detail and the rationale behind each choice.

```mermaid
erDiagram
    USER ||--o{ POST : "authors"
    USER {
        ObjectId _id
        string username UK
        string email UK
        string password "select: false"
        string role "user | admin"
        date createdAt
    }
    POST {
        ObjectId _id
        string title
        string body
        string status "draft | published | archived"
        string[] tags
        ObjectId author FK "ref User"
        date createdAt
    }
```

## Build history

Work proceeds one branch per step, merged to `main` by PR.

| Commit | Change |
|--------|--------|
| `c5e5b14` | Initial commit |
| `31ed5f2` | `.gitignore` for Claude artifacts and specs |
| `c86a0c2` | Initial (empty) ARCHITECTURE.md and DESIGN.md placeholders |
| `811d1cf` | `.env.example` (PORT, MONGO_URI, JWT_SECRET) |
| `315724e` | `package.json` + dependencies (express, mongoose, dotenv, nodemon) |
| `35ff64d` | Express app with `/health` endpoint (`src/app.js`) |
| `033ecbc` | Entry point wiring app + DB connection (`src/server.js`) |
| `6525abf` | `connectDB()` utility (`src/config/db.js`) |
| `6bd3770` | `.gitkeep` files for `controllers/`, `routes/`, `middleware/`, `models/` |
| `0ea61e9` | Merge PR #1 — step 1 complete |
| `594f745` | Post model (`src/models/Post.js`) |
| `c9ae7a6` | User model (`src/models/User.js`) |
| `6d88872` | Merge PR #2 — step 2 complete |
| `c0886da`–`7645f14` | Step-3 CRUD: controller, routes, `/api/posts` mount, `tags` index |
| `893ecf2` | Merge PR #3 — step 3 complete |
| `512033a`–`5a0ac04` | Step-4 auth: `authController.js`, `authRoutes.js`, `requireAuth.js`, `validators/`, bcrypt hook in `User.js` |
| `5caa512` | Merge PR #4 — step 4 complete |
| *(uncommitted, step 5)* | Central error handling: `AppError.js`, `errorHandler.js`, `notFound.js`; `sendError.js` deleted; controllers/middleware/validators converted to throw/`next(err)` |
