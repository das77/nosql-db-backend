# Design rationale

## Schema design

`Post.author` is an `ObjectId` reference, not an embedded subdocument. Users are long-lived
and mutable, so embedding would mean rewriting every post on a username change;
`populate('author', 'username email')` reads conveniently without duplicating data.

`User.password` uses `select: false` and registration serializes through `publicUser()`, so
the hash never reaches a response by either route. Hashing lives in a pre-save hook, so
every write path gets it without a controller having to remember.

`email` combines `lowercase: true` with `unique`, making the unique index case-insensitive:
`Ada@example.com` and `ada@example.com` cannot both register.

## Filtering, sorting, pagination

The Mongo filter is built only from whitelisted fields (`status`, `author`, `tags`).
Spreading `req.query` into a query object is an operator-injection vector
(`?author[$ne]=x`); a whitelist removes the bug class rather than sanitizing around it.
Both paging modes share it.

Two pagination modes answer different questions. Offset (`page`/`limit`) jumps to any page,
but Mongo walks and discards `skip` documents, so cost grows with depth. Cursor (`?cursor=`)
stays constant-cost at any depth and runs no count query, but pages forward only, on the
default `-createdAt` sort. `limit` is capped at 100 in both, which is what makes the
endpoint safe to expose publicly.

## Indexes

`{ status: 1, createdAt: -1 }` serves the common access pattern — a status filter with the
default sort — in one scan, and its prefix covers bare `status` lookups too. `author` backs
both the filter and the ownership lookups on PUT/DELETE. `tags` stays unindexed until
cardinality justifies the multikey cost.

## Authentication

Tokens are stateless JWTs carrying `{ id, role }` with a one-hour expiry, so authorization
needs no session store and no database read. Protection is two layers: `requireAuth`
establishes who you are and fails with 401; `assertCanMutate` decides what you may touch —
the post's author, or an admin — and fails with 403. Separate questions, separate codes.

## NoSQL vs. relational

MongoDB fits this shape. `Post.tags` is a variable-length array stored inline; relationally
it would be a join table for one field. There is one relationship, which `populate()`
resolves without a join, and no invariant spans both collections.

A relational database would win where this one is weak. Mongo has no foreign keys: nothing
enforces referential integrity, and a user deleted directly would leave posts pointing at a
missing `_id`. Anything needing atomic multi-entity writes belongs in Postgres.
