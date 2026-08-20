# Design rationale

## Schema design

`Post.author` is an `ObjectId` reference rather than an embedded subdocument. Users are
long-lived and mutable, so embedding would mean rewriting every post on a username change;
`populate('author', 'username email')` gives read-side convenience without duplicating
data.

`User.password` uses `select: false`, so no query returns the hash by accident — login is
the only caller that opts in with `.select('+password')`. That guard misses
`User.create()`'s return value, so registration serializes through an explicit
`publicUser()`. Hashing lives in a pre-save hook, so every write path gets it without a
controller having to remember.

`email` combines `lowercase: true` with `unique`, making the unique index
case-insensitive in practice: `Ada@example.com` and `ada@example.com` cannot both register.

## Filtering, sorting, pagination

The Mongo filter is built only from whitelisted fields (`status`, `author`, `tags`).
Spreading `req.query` into a query object is an operator-injection vector
(`?author[$ne]=x`); a whitelist removes the bug class rather than sanitizing around it.

Pagination uses `skip`/`limit`, matching the required
`{ data, page, limit, total, totalPages }` envelope. The known cost is depth: Mongo walks
and discards `skip` documents, so deep pages degrade — acceptable at this scale, with
cursor-based pagination as the upgrade path. `limit` is capped at 100 unconditionally,
which is what makes the endpoint safe to expose publicly.

## Authentication

Tokens are stateless JWTs carrying `{ id, role }` with a one-hour expiry, so authorization
needs no session store and no database read. Protection is two layers: `requireAuth`
establishes who you are and fails with 401; `assertCanMutate` decides what you may touch —
the post's author, or an admin — and fails with 403. Authentication and authorization are
separate questions and get separate status codes.

## NoSQL vs. relational

MongoDB fits this shape. `Post.tags` is a variable-length array stored inline and served by
a multikey index; relationally it would be a join table for what is genuinely one field.
There is exactly one relationship, which `populate()` resolves without a join, and no
invariant spans both collections, so posts and users are written independently.

A relational database would win where this one is weak. Mongo has no foreign keys: nothing
enforces referential integrity, and a user removed directly from the database would leave
posts pointing at a missing `_id`. Anything needing atomic multi-entity writes — an order
debiting inventory and recording a payment together — or heavy ad-hoc reporting across
normalized tables belongs in Postgres.
