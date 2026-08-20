# nosql-db-backend

Demonstrate competence with MongoDB, Mongoose schema design, and integrating a database
with an Express API.

An Express 5 + Mongoose 9 REST backend, built incrementally in reviewable steps
(one branch per step). Each step is merged into `main` via PR before the next begins.

<!-- docs-pages-link:start -->
📚 Docs: https://das77.github.io/nosql-db-backend/
<!-- docs-pages-link:end -->

## Stack

| Component | Choice | Version |
|-----------|--------|---------|
| Runtime | Node.js (CommonJS) | — |
| Web framework | Express | ^5.2.1 |
| ODM | Mongoose | ^9.9.3 |
| Database | MongoDB | via `MONGO_URI` |
| Config | dotenv | ^17.4.2 |
| Dev reload | nodemon | ^3.1.14 |

## Getting started

Either path needs a `.env` first — it's gitignored, so a fresh clone has none:

```bash
cp .env.example .env     # then set a real JWT_SECRET
```

| Variable | Default | Notes |
|----------|---------|-------|
| `PORT` | `3000` | HTTP port the API listens on |
| `MONGO_URI` | `mongodb://localhost:27017/app` | Used for host-mode runs. Under `docker compose up` this value is **ignored** — `docker-compose.yml` sets `MONGO_URI` to `mongodb://mongo:27017/app` for the container regardless of what's in `.env` |
| `JWT_SECRET` | — | Secret used to sign and verify JWTs |

### Run with Docker (recommended)

```bash
docker compose up --build
curl http://localhost:3000/health
# {"status":"ok"}
```

Brings up `api` and `mongo` together; `api` waits for Mongo's healthcheck before it
starts, so a cold start (Mongo initializing `/data/db` for the first time) doesn't
race and crash. **`.env` must exist before this command** — `env_file: .env` in
Compose is a hard error if the file is missing.

- `docker compose down` stops the containers; data in Mongo **survives** (a named
  volume persists it).
- `docker compose down -v` also removes the volume — the next `up` starts from an
  empty database.

### Run on the host

```bash
npm install
npm run dev    # nodemon, restarts on change
# or
npm start      # plain node
```

Requires a MongoDB reachable at the `MONGO_URI` in your `.env` (the default assumes
`localhost:27017`, e.g. a Mongo you started separately, including via
`docker compose up` — the `27017:27017` port mapping makes the containerized Mongo
reachable from the host too).

```bash
curl http://localhost:3000/health
# {"status":"ok"}
```

The server exits with code 1 if MongoDB is unreachable at boot — it does not start
listening without a database connection.

## API

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/health` | Liveness check, returns `{"status":"ok"}` |
| POST | `/api/auth/register` | Register; returns `{ token, user }` |
| POST | `/api/auth/login` | Log in; returns `{ token, user }` |
| GET | `/api/posts` | List posts; supports `?status=`, `?author=`, `?tags=`, `?sort=`, `?page=`, `?limit=` |
| GET | `/api/posts/:id` | Fetch one post with its author populated |
| POST | `/api/posts` | Create a post — requires `Authorization: Bearer <token>` |
| PUT | `/api/posts/:id` | Update a post — requires bearer token; author or admin only |
| DELETE | `/api/posts/:id` | Delete a post — requires bearer token; author or admin only |
| GET | `/api-docs` | Interactive OpenAPI documentation (Swagger UI) |

### API documentation

Start the app either way (`npm run dev` or `docker compose up`), then open
<http://localhost:3000/api-docs>. The page is fully interactive: register or log in
with "Try it out", copy the returned `token`, click **Authorize** and paste it in,
then exercise the protected Post routes — everything drives real requests against the
running API without leaving the browser. The token expires after 1 hour; log in again
through the page to get a fresh one.

### Authentication

Register (or log in) to receive a JWT, then send it on every mutating request as
`Authorization: Bearer <token>`. Tokens expire after 1 hour — log in again for a
fresh one.

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"ada","email":"ada@example.com","password":"correct horse"}' | jq -r .token)

curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Hello","body":"My first post, at least ten chars."}'
```

A post's `author` always comes from the token — it cannot be set in the request body.

### Query parameters

`GET /api/posts` responds with the pagination envelope
`{ data, page, limit, total, totalPages }`. `limit` defaults to 10 and is capped at
100 — asking for more silently gets 100. `?tags=` accepts a comma-separated list and
matches posts having any of them; `?sort=` accepts comma-separated fields with a `-`
prefix for descending (default `-createdAt`).

```bash
curl 'http://localhost:3000/api/posts?status=published&tags=node,express&sort=-createdAt&page=1&limit=20'
```

Error responses use the envelope `{ "error": { "message", "status", "details" } }`.

### Error responses

Every error the API returns — validation failures, auth failures, not-found, conflicts,
and unexpected server errors — goes through one centralized handler and uses the same
envelope: `{ "error": { "message": string, "status": number, "details": [...] | null } }`.

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Bad input | Failed validation chain or Mongoose validator, malformed `?author=` |
| 401 | Not authenticated | Missing/invalid/expired bearer token, bad credentials |
| 403 | Authenticated but not permitted | Editing/deleting someone else's post as a non-admin |
| 404 | Resource not found | Unknown post id, malformed post `:id`, unmatched route |
| 409 | Conflict | Duplicate `username`/`email` on register |
| 500 | Unexpected server error | Never includes `err.message` or a stack trace |

An unmatched route (e.g. `GET /api/nope`) also returns this JSON envelope with a 404,
not Express's default HTML error page.

## Project structure

```
src/
  server.js        Entry point: loads .env, connects DB, starts listening
  app.js           Express app: middleware + routes (exported separately for testability)
  config/
    db.js          connectDB() — mongoose.connect with fail-fast on error
    swagger.js     Loads and parses openapi.yaml at boot (fail-fast if missing/malformed)
  models/
    User.js        User schema (username, email, password, role)
    Post.js        Post schema (title, body, status, tags, author → User)
  controllers/
    postController.js  Post CRUD handlers: filtering, sorting, pagination, ownership check
    authController.js  register/login — bcrypt via the User model, JWT issuing
  routes/
    postRoutes.js  /api/posts router wiring the five handlers
    authRoutes.js  /api/auth router: register + login
  middleware/
    requireAuth.js Verifies the Bearer JWT, sets req.user { id, role }
    notFound.js    Catch-all for unmatched routes — forwards a 404 AppError
    errorHandler.js  Central error handler — the only place that writes the error envelope
  validators/
    index.js       express-validator chains + shared 400 collector
  utils/
    AppError.js    Error subclass carrying the status/details the handler responds with
docs/
  ARCHITECTURE.md  Layering, boot sequence, request flow
  DESIGN.md        Schema design and rationale
  RATIONALE.md     Why the schemas, query layer, and auth are built this way (short form)
openapi.yaml        OpenAPI 3.1 spec for the entire API surface, served at GET /api-docs
Dockerfile          node:24-slim image; npm ci --omit=dev; runs as the non-root node user
docker-compose.yml  api + mongo services, healthcheck-gated startup, named volume
.dockerignore       Keeps node_modules, .env, and non-runtime files out of the build context
```

## Design rationale

See [docs/RATIONALE.md](docs/RATIONALE.md) for the short version of why the schemas, query layer, and
auth are built this way, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces
fit together, and [docs/DESIGN.md](docs/DESIGN.md) for the full per-step design log.
