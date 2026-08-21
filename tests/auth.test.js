const request = require('supertest');
const app = require('../src/app');
const { registerUser } = require('./helpers');

describe('POST /api/auth/register', () => {
  it('returns 201 with a token and the public user shape, no password field', async () => {
    const { res } = await registerUser({ username: 'newuser', email: 'newuser@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toEqual({
      id: expect.any(String),
      username: 'newuser',
      email: 'newuser@example.com',
      role: 'user'
    });
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('returns 409 when the email is already registered, even with a different username', async () => {
    await registerUser({ username: 'first', email: 'dup@example.com' });
    const { res } = await registerUser({ username: 'second', email: 'dup@example.com' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        message: expect.any(String),
        status: 409,
        details: null
      }
    });
    expect(res.body.error.message).not.toMatch(/E11000/);
  });

  it('returns 409 when the username is already registered, even with a different email', async () => {
    await registerUser({ username: 'dupuser', email: 'first@example.com' });
    const { res } = await registerUser({ username: 'dupuser', email: 'second@example.com' });
    expect(res.status).toBe(409);
  });

  it('returns 400 with one message per failing field when input is invalid', async () => {
    const { res } = await registerUser({ email: 'not-an-email', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.any(String), expect.any(String)])
    );
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });

  it('ignores a role field in the request body — new users are always "user"', async () => {
    const { res } = await registerUser({ username: 'wannabe', email: 'wannabe@example.com', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('user');
  });
});

describe('POST /api/auth/login', () => {
  it('returns 200 with a token for correct credentials', async () => {
    await registerUser({ username: 'loginuser', email: 'login@example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('returns the same 401 message for a wrong password and for an unregistered email', async () => {
    await registerUser({ username: 'wrongpass', email: 'wrongpass@example.com', password: 'password123' });

    const wrongPassRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'wrongpass@example.com', password: 'nope-not-it' });
    const unknownEmailRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'never-registered@example.com', password: 'password123' });

    expect(wrongPassRes.status).toBe(401);
    expect(unknownEmailRes.status).toBe(401);
    expect(wrongPassRes.body.error.message).toBe(unknownEmailRes.body.error.message);
  });

  it('logs in successfully when the email is typed in different casing', async () => {
    await registerUser({ username: 'caseuser', email: 'CaseUser@Example.com', password: 'password123' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'CASEUSER@EXAMPLE.COM', password: 'password123' });
    expect(res.status).toBe(200);
  });
});
