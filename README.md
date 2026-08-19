# nosql-db-backend

Demonstrate competence with MongoDB, Mongoose schema design, and integrating a database
with an Express API.

An Express 5 + Mongoose 9 REST backend, built incrementally in reviewable steps
(one branch per step). Each step is merged into `main` via PR before the next begins.

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

1. Copy the environment template and adjust it:

   ```bash
   cp .env.example .env
   ```

   | Variable | Default | Notes |
   |----------|---------|-------|
   | `PORT` | `3000` | HTTP port the API listens on |
   | `MONGO_URI` | `mongodb://mongo:27017/app` | Default assumes Docker Compose (host `mongo`); use `mongodb://localhost:27017/app` when running directly on the host |
   | `JWT_SECRET` | — | Secret used to sign and verify JWTs |

2. Install and run:

   ```bash
   npm install
   npm run dev    # nodemon, restarts on change
   # or
   npm start      # plain node
   ```

3. Verify:

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

## Project structure

```
src/
  server.js        Entry point: loads .env, connects DB, starts listening
  app.js           Express app: middleware + routes (exported separately for testability)
  config/
    db.js          connectDB() — mongoose.connect with fail-fast on error
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
  validators/
    index.js       express-validator chains + shared 400 collector
  utils/
    sendError.js   Interim error envelope helper (replaced by middleware in step 5)
docs/
  ARCHITECTURE.md  Layering, boot sequence, request flow
  DESIGN.md        Schema design and rationale
```

## Build roadmap

| Step | Branch | Status |
|------|--------|--------|
| 1 | `step-1-project-setup` — Express server, health check, DB connection utility | ✅ merged (PR #1) |
| 2 | `step-2-mongoose-schemas` — User and Post models | ✅ merged (PR #2) |
| 3 | `step-3-crud-query-features` — CRUD routes, `?status=`/`?author=` filters | ✅ merged (PR #3) |
| 4 | `step-4-auth-validation` — bcrypt password hashing, JWT auth | ✅ current branch |
| 5 | `step-5-error-handling` — central error handler (ValidationError, duplicate key) | planned |
| 6 | `step-6-docker` — Docker Compose (API + Mongo) | planned |
| 7 | `step-7-docs-rationale` — final documentation pass | planned |

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together and
[docs/DESIGN.md](docs/DESIGN.md) for why the schemas look the way they do.
