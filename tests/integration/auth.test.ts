import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app';
import User from '../../src/models/User.model';

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
});

afterEach(async () => {
  await User.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('POST /api/auth/signup', () => {
  it('registers a new user and returns a JWT', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe('alice@example.com');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email with 409', async () => {
    await request(app).post('/api/auth/signup').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/signup').send({
      username: 'alice2',
      email: 'alice@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('rejects invalid payload with 400 (edge case: short password)', async () => {
    const res = await request(app).post('/api/auth/signup').send({
      username: 'bob',
      email: 'bob@example.com',
      password: '123',
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/signup').send({
      username: 'carol',
      email: 'carol@example.com',
      password: 'password123',
    });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'carol@example.com',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
  });

  it('rejects incorrect password with 401 (edge case)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'carol@example.com',
      password: 'wrong-password',
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/auth/me', () => {
  it('rejects requests without a token with 401 (edge case)', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user profile with a valid token', async () => {
    const signupRes = await request(app).post('/api/auth/signup').send({
      username: 'dave',
      email: 'dave@example.com',
      password: 'password123',
    });
    const token = signupRes.body.data.token;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('dave@example.com');
  });
});
