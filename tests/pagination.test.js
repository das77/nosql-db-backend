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

describe('GET /api/posts cursor mode', () => {
  // A valid cursor pointing far in the future, so it precedes every seeded post
  // in -createdAt order. Used by tests that need a syntactically valid cursor
  // without caring where it lands.
  function futureCursor() {
    return Buffer.from(
      JSON.stringify({
        createdAt: new Date('2999-01-01T00:00:00.000Z'),
        _id: '000000000000000000000000'
      })
    ).toString('base64');
  }

  async function traverse(baseQuery, pageLimit) {
    const collected = [];
    const pageSizes = [];
    let res = await request(app).get(`/api/posts?${baseQuery}&cursor=${encodeURIComponent(futureCursor())}&limit=${pageLimit}`);
    expect(res.status).toBe(200);
    collected.push(...res.body.data.map((p) => p._id));
    pageSizes.push(res.body.data.length);

    while (res.body.hasMore) {
      // eslint-disable-next-line no-await-in-loop
      res = await request(app).get(`/api/posts?${baseQuery}&cursor=${encodeURIComponent(res.body.nextCursor)}&limit=${pageLimit}`);
      expect(res.status).toBe(200);
      collected.push(...res.body.data.map((p) => p._id));
      pageSizes.push(res.body.data.length);
    }
    return { collected, pageSizes, last: res };
  }

  it('traverses every post exactly once when every createdAt is identical', async () => {
    const { token } = await registerUser();
    const seeded = await seedPosts(token, 25);

    // Give every post the SAME createdAt, so every page boundary lands on a tie.
    // This is the case the _id tiebreaker in the $or exists for: without it, the
    // second page's `createdAt < X` matches nothing and the traversal stops at 10.
    // A tie that doesn't straddle a page boundary would not exercise it at all.
    const Post = require('../src/models/Post');
    await Post.updateMany({}, { createdAt: new Date('2026-01-01T00:00:00.000Z') });

    const { collected, pageSizes, last } = await traverse('', 10);

    expect(collected.length).toBe(25);
    expect(new Set(collected).size).toBe(25);
    expect(new Set(collected)).toEqual(new Set(seeded.map((p) => p._id)));
    expect(pageSizes).toEqual([10, 10, 5]);
    expect(last.body.hasMore).toBe(false);
    expect(last.body.nextCursor).toBeNull();
  });

  it('omits the offset envelope fields', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 3);
    const res = await request(app).get(`/api/posts?cursor=${encodeURIComponent(futureCursor())}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: expect.any(Array),
      limit: 10,
      nextCursor: null,
      hasMore: false
    });
  });

  describe.each([
    ['not base64-decodable JSON', '!!!'],
    ['base64 of non-JSON', Buffer.from('not json at all').toString('base64')],
    ['base64 of a JSON array', Buffer.from('[1,2,3]').toString('base64')],
    ['base64 of JSON null', Buffer.from('null').toString('base64')],
    ['a non-date createdAt', Buffer.from(JSON.stringify({ createdAt: 'banana', _id: '000000000000000000000000' })).toString('base64')],
    ['a bogus _id', Buffer.from(JSON.stringify({ createdAt: new Date().toISOString(), _id: 'nope' })).toString('base64')]
  ])('malformed cursor — %s', (_label, badCursor) => {
    it('returns 400, and specifically not 404', async () => {
      const { token } = await registerUser();
      await createPost(token);
      const res = await request(app).get(`/api/posts?cursor=${encodeURIComponent(badCursor)}`);
      // 404 is what the un-guarded implementation returns (CastError → 404 from
      // the central handler), so asserting "not 200" would pass against the bug.
      expect(res.status).not.toBe(404);
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Invalid cursor');
    });
  });

  it('rejects cursor combined with a non-default sort', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 3);
    const res = await request(app).get(`/api/posts?cursor=${encodeURIComponent(futureCursor())}&sort=title`);
    expect(res.status).toBe(400);
  });

  it('allows cursor with an explicitly-stated default sort', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 3);
    const res = await request(app).get(`/api/posts?cursor=${encodeURIComponent(futureCursor())}&sort=-createdAt`);
    expect(res.status).toBe(200);
  });

  it('resolves ?page=2&cursor=... to offset mode', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 25);
    const res = await request(app).get(`/api/posts?page=2&cursor=${encodeURIComponent(futureCursor())}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(25);
    expect(res.body.totalPages).toBe(3);
    expect(res.body.page).toBe(2);
    expect(res.body.nextCursor).toBeUndefined();
  });

  it('applies filters while traversing by cursor', async () => {
    const { token } = await registerUser();
    await seedPosts(token, 18, { status: 'draft' });
    await seedPosts(token, 7, { status: 'published' });

    const { collected, last } = await traverse('status=published', 5);

    expect(collected.length).toBe(7);
    expect(new Set(collected).size).toBe(7);
    expect(last.body.hasMore).toBe(false);
  });

  it('caps limit at 100 in cursor mode', async () => {
    const { token } = await registerUser();
    await createPost(token);
    const res = await request(app).get(`/api/posts?cursor=${encodeURIComponent(futureCursor())}&limit=5000`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });
});
