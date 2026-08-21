const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../src/app');
const { registerUser, registerAdmin, createPost } = require('./helpers');

describe('GET /api/posts/:id', () => {
  it('returns 200 with author populated to exactly username and email', async () => {
    const { token } = await registerUser();
    const post = await createPost(token);

    const res = await request(app).get(`/api/posts/${post._id}`);

    expect(res.status).toBe(200);
    expect(Object.keys(res.body.author).sort()).toEqual(['_id', 'email', 'username']);
  });

  it('returns 404 for a valid-but-absent id', async () => {
    const res = await request(app).get('/api/posts/000000000000000000000000');
    expect(res.status).toBe(404);
  });

  it('returns 404 (not 400) for a malformed id', async () => {
    const res = await request(app).get('/api/posts/xyz');
    expect(res.status).toBe(404);
  });
});

describe('POST /api/posts', () => {
  it('creates a post as the token user with a valid token', async () => {
    const { token, user } = await registerUser();
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'A valid title', body: 'A valid body, long enough to pass.' });

    expect(res.status).toBe(201);
    expect(res.body.author._id).toBe(user.id);
  });

  it('ignores an author field in the body naming a different user', async () => {
    const { token, user } = await registerUser();
    const { user: otherUser } = await registerUser();
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A valid title',
        body: 'A valid body, long enough to pass.',
        author: otherUser.id
      });

    expect(res.status).toBe(201);
    expect(res.body.author._id).toBe(user.id);
    expect(res.body.author._id).not.toBe(otherUser.id);
  });

  it('returns 401 with no token, and 401 with a garbage token', async () => {
    const noTokenRes = await request(app)
      .post('/api/posts')
      .send({ title: 'A valid title', body: 'A valid body, long enough to pass.' });
    const garbageTokenRes = await request(app)
      .post('/api/posts')
      .set('Authorization', 'Bearer garbage')
      .send({ title: 'A valid title', body: 'A valid body, long enough to pass.' });

    expect(noTokenRes.status).toBe(401);
    expect(garbageTokenRes.status).toBe(401);
  });

  it('returns 400 when the title is too short', async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post('/api/posts')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'ab', body: 'A valid body, long enough to pass.' });
    expect(res.status).toBe(400);
  });
});

describe.each([['put'], ['delete']])('ownership rules for %s /api/posts/:id', (method) => {
  function attempt(id, token, body) {
    const req = request(app)[method](`/api/posts/${id}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    if (body) req.send(body);
    return req;
  }

  const updateBody = method === 'put' ? { title: 'An updated title' } : undefined;

  it('succeeds as the post author', async () => {
    const { token } = await registerUser();
    const post = await createPost(token);

    const res = await attempt(post._id, token, updateBody);

    if (method === 'put') {
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('An updated title');
    } else {
      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    }
  });

  it('returns 403 for a different non-admin user, and leaves the post intact', async () => {
    const { token: authorToken } = await registerUser();
    const post = await createPost(authorToken);
    const { token: otherToken } = await registerUser();

    const res = await attempt(post._id, otherToken, updateBody);
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('You may only modify your own posts');

    const getRes = await request(app).get(`/api/posts/${post._id}`);
    expect(getRes.status).toBe(200);
  });

  it('succeeds for an admin acting on someone else\'s post', async () => {
    const { token: authorToken } = await registerUser();
    const post = await createPost(authorToken);
    const { token: adminToken } = await registerAdmin();

    const res = await attempt(post._id, adminToken, updateBody);
    expect([200, 204]).toContain(res.status);
  });

  it('returns 401 with no token', async () => {
    const { token } = await registerUser();
    const post = await createPost(token);
    const res = await attempt(post._id, null, updateBody);
    expect(res.status).toBe(401);
  });

  it('returns 401 with an invalid token', async () => {
    const { token } = await registerUser();
    const post = await createPost(token);
    const res = await attempt(post._id, 'garbage', updateBody);
    expect(res.status).toBe(401);
  });

  it('returns 401 with an expired token', async () => {
    const { token, user } = await registerUser();
    const post = await createPost(token);
    const expiredToken = jwt.sign({ id: user.id, role: 'user' }, process.env.JWT_SECRET, {
      expiresIn: '-1s'
    });
    const res = await attempt(post._id, expiredToken, updateBody);
    expect(res.status).toBe(401);
  });

  it('returns 404 for a valid-but-absent id', async () => {
    const { token } = await registerUser();
    const res = await attempt('000000000000000000000000', token, updateBody);
    expect(res.status).toBe(404);
  });

  it('returns 404 for a malformed id', async () => {
    const { token } = await registerUser();
    const res = await attempt('xyz', token, updateBody);
    expect(res.status).toBe(404);
  });
});
