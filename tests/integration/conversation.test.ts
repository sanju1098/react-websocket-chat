import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../src/app';
import User from '../../src/models/User.model';
import Conversation from '../../src/models/Conversation.model';
import Message from '../../src/models/Message.model';

async function createUserAndGetToken(
  username: string,
  email: string
): Promise<{ token: string; userId: string }> {
  const res = await request(app).post('/api/auth/signup').send({
    username,
    email,
    password: 'password123',
  });
  return { token: res.body.data.token, userId: res.body.data.user._id };
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({})]);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('POST /api/conversations', () => {
  it('creates a 1:1 conversation between two users', async () => {
    const userA = await createUserAndGetToken('userA', 'usera@example.com');
    const userB = await createUserAndGetToken('userB', 'userb@example.com');

    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: '1:1', members: [userB.userId] });

    expect(res.status).toBe(201);
    expect(res.body.data.conversation.type).toBe('1:1');
    expect(res.body.data.conversation.members).toHaveLength(2);
  });

  it('rejects requests without auth token with 401 (edge case)', async () => {
    const res = await request(app)
      .post('/api/conversations')
      .send({ type: '1:1', members: ['x'] });
    expect(res.status).toBe(401);
  });

  it('rejects group conversation without a name with 400 (edge case)', async () => {
    const userA = await createUserAndGetToken('userA2', 'usera2@example.com');
    const userB = await createUserAndGetToken('userB2', 'userb2@example.com');

    const res = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: 'group', members: [userB.userId] });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/conversations', () => {
  it('lists only conversations the user is a member of', async () => {
    const userA = await createUserAndGetToken('userA3', 'usera3@example.com');
    const userB = await createUserAndGetToken('userB3', 'userb3@example.com');
    const userC = await createUserAndGetToken('userC3', 'userc3@example.com');

    await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: '1:1', members: [userB.userId] });

    await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userB.token}`)
      .send({ type: '1:1', members: [userC.userId] });

    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.conversations).toHaveLength(1);
  });

  it('computes unreadCount as 0 for a conversation with no messages', async () => {
    const userA = await createUserAndGetToken('userA6', 'usera6@example.com');
    const userB = await createUserAndGetToken('userB6', 'userb6@example.com');

    await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: '1:1', members: [userB.userId] });

    const res = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.body.data.conversations[0].unreadCount).toBe(0);
  });

  it("excludes the recipient's own sent messages from their unreadCount (edge case)", async () => {
    const userA = await createUserAndGetToken('userA7', 'usera7@example.com');
    const userB = await createUserAndGetToken('userB7', 'userb7@example.com');

    const convoRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: '1:1', members: [userB.userId] });

    await Message.create({
      conversationId: convoRes.body.data.conversation._id,
      senderId: userA.userId,
      text: 'Hi from A',
      status: 'sent',
    });

    const resA = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`);
    const resB = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${userB.token}`);

    expect(resA.body.data.conversations[0].unreadCount).toBe(0);
    expect(resB.body.data.conversations[0].unreadCount).toBe(1);
  });
});

describe('GET /api/conversations/:id/messages', () => {
  it('returns 404 (edge case) when user is not a member of the conversation', async () => {
    const userA = await createUserAndGetToken('userA4', 'usera4@example.com');
    const userB = await createUserAndGetToken('userB4', 'userb4@example.com');
    const userC = await createUserAndGetToken('userC4', 'userc4@example.com');

    const convoRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: '1:1', members: [userB.userId] });

    const res = await request(app)
      .get(`/api/conversations/${convoRes.body.data.conversation._id}/messages`)
      .set('Authorization', `Bearer ${userC.token}`);

    expect(res.status).toBe(404);
  });

  it('returns paginated empty history for a valid, empty conversation', async () => {
    const userA = await createUserAndGetToken('userA5', 'usera5@example.com');
    const userB = await createUserAndGetToken('userB5', 'userb5@example.com');

    const convoRes = await request(app)
      .post('/api/conversations')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ type: '1:1', members: [userB.userId] });

    const res = await request(app)
      .get(`/api/conversations/${convoRes.body.data.conversation._id}/messages`)
      .set('Authorization', `Bearer ${userA.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.messages).toHaveLength(0);
    expect(res.body.data.hasMore).toBe(false);
  });
});
