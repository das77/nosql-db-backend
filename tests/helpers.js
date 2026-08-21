const request = require('supertest');
const app = require('../src/app');
const User = require('../src/models/User');

let counter = 0;
// Unique-per-call defaults: without this, a second registerUser() in a single
// test would hit the 409 the suite is elsewhere asserting on.
function nextId() {
  counter += 1;
  return counter;
}

// Uses the real endpoint rather than User.create() so the helper exercises the
// same path the app does — including the pre-save hash.
async function registerUser(overrides = {}) {
  const n = nextId();
  const body = {
    username: `user${n}`,
    email: `user${n}@example.com`,
    password: 'password123',
    ...overrides
  };
  const res = await request(app).post('/api/auth/register').send(body);
  return { token: res.body.token, user: res.body.user, res };
}

async function registerAdmin(overrides = {}) {
  const { user, res } = await registerUser(overrides);
  await User.findByIdAndUpdate(user.id, { role: 'admin' });
  // Re-login: the JWT carries role at signing time, so the token from the original
  // registration still says role: 'user'. Promoting without re-issuing produces a
  // 403 in a test meant to prove admins get a 200 — and it looks like a bug in
  // assertCanMutate rather than a bug in the test.
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ email: res.body.user.email, password: overrides.password || 'password123' });
  return { token: loginRes.body.token, user: loginRes.body.user };
}

async function createPost(token, overrides = {}) {
  const body = {
    title: 'A valid post title',
    body: 'A valid post body, long enough to pass validation.',
    ...overrides
  };
  const res = await request(app)
    .post('/api/posts')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  return res.body;
}

// Sequential, not Promise.all, so createdAt ordering is deterministic for sort
// assertions.
async function seedPosts(token, count, overrides = {}) {
  const posts = [];
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const post = await createPost(token, {
      title: `Seeded post ${i}`,
      body: 'A valid post body, long enough to pass validation.',
      ...overrides
    });
    posts.push(post);
  }
  return posts;
}

module.exports = { registerUser, registerAdmin, createPost, seedPosts };
