const request = require('supertest');
const app = require('../src/app');
const { registerUser, seedPosts, createPost } = require('./helpers');

describe('GET /api/posts pagination — unfiltered set of 25', () => {
  let token;

  beforeEach(async () => {
    ({ token } = await registerUser());
    await seedPosts(token, 25);
  });

  it('defaults to page 1, limit 10', async () => {
    const res = await request(app).get('/api/posts');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
    expect(res.body.data.length).toBe(10);
    expect(res.body.total).toBe(25);
    expect(res.body.totalPages).toBe(3);
  });

  it('caps a huge limit at 100 rather than passing it through', async () => {
    const res = await request(app).get('/api/posts?limit=5000');
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
    expect(res.body.data.length).toBe(25);
  });

  it('returns an empty page (not an error) past the end', async () => {
    const res = await request(app).get('/api/posts?page=99');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.total).toBe(25);
    expect(res.body.totalPages).toBe(3);
  });

  it('falls back to defaults on non-numeric page/limit, without erroring', async () => {
    const res = await request(app).get('/api/posts?page=abc&limit=xyz');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
  });

  it('falls back to defaults on negative page/limit, without erroring', async () => {
    const res = await request(app).get('/api/posts?page=-5&limit=-10');
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(10);
  });

  it('sorts descending and ascending by createdAt with opposite first elements', async () => {
    const desc = await request(app).get('/api/posts?sort=-createdAt&limit=25');
    const asc = await request(app).get('/api/posts?sort=createdAt&limit=25');
    expect(desc.body.data[0]._id).toBe(asc.body.data[asc.body.data.length - 1]._id);
    expect(asc.body.data[0]._id).toBe(desc.body.data[desc.body.data.length - 1]._id);
  });

  it('parses a two-field sort without error', async () => {
    const res = await request(app).get('/api/posts?sort=title,-createdAt');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/posts pagination — filtered', () => {
  it('filters by status and reports the filtered total, not the collection total', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 18, { status: 'draft' });
    await seedPosts(token, 7, { status: 'published' });

    const res = await request(app).get('/api/posts?status=published&page=1&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.data.length).toBe(5);
    expect(res.body.data.every((p) => p.status === 'published')).toBe(true);
  });

  it('filters by tags (comma-separated, matches any) and reports the filtered total', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 18, { tags: ['other'] });
    await seedPosts(token, 7, { tags: ['node', 'express'] });

    const res = await request(app).get('/api/posts?tags=node,express&page=1&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.data.length).toBe(5);
  });

  it('filters by author and reports the filtered total', async () => {
    const { token: tokenA, user: userA } = await registerUser();
    const { token: tokenB } = await registerUser();
    await seedPosts(tokenB, 18);
    await seedPosts(tokenA, 7);

    const res = await request(app).get(`/api/posts?author=${userA.id}&page=1&limit=5`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(7);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.data.length).toBe(5);
    expect(res.body.data.every((p) => p.author._id === userA.id)).toBe(true);
  });

  it('returns 400 for a malformed author filter value', async () => {
    const { token } = await registerUser();
    await createPost(token);
    const res = await request(app).get('/api/posts?author=garbage');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid author id');
  });
});
