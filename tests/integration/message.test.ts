import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import mongoose from 'mongoose';
import app from '../../src/app';
import { initSocketServer } from '../../src/sockets';
import { signToken } from '../../src/utils/jwt';
import User from '../../src/models/User.model';
import Conversation from '../../src/models/Conversation.model';
import Message from '../../src/models/Message.model';

let httpServer: http.Server;
let port: number;

async function createUser(username: string, email: string) {
  const user = await User.create({ username, email, passwordHash: 'irrelevant-for-socket-tests' });
  const token = signToken({ userId: user._id.toString(), username: user.username, email: user.email });
  return { user, token };
}

function connectClient(token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });
    client.on('connect', () => resolve(client));
    client.on('connect_error', (err) => reject(err));
  });
}

function joinRoom(client: ClientSocket, conversationId: string): Promise<unknown> {
  return new Promise((resolve) => client.emit('conversation:join', conversationId, resolve));
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGODB_URI as string);
  httpServer = http.createServer(app);
  await initSocketServer(httpServer);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      resolve();
    });
  });
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), Conversation.deleteMany({}), Message.deleteMany({})]);
});

afterAll(async () => {
  // Allow any in-flight async presence handlers (triggered by socket
  // disconnects in the preceding tests) to finish before tearing down Mongo.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('message:send / message:new', () => {
  it('persists the message and broadcasts message:new to all room members', async () => {
    const { user: userA, token: tokenA } = await createUser('msgUserA', 'msguserA@example.com');
    const { user: userB, token: tokenB } = await createUser('msgUserB', 'msguserB@example.com');

    const conversation = await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });

    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);

    await joinRoom(clientA, conversation._id.toString());
    await joinRoom(clientB, conversation._id.toString());

    const receivedByB = new Promise((resolve) => {
      clientB.on('message:new', resolve);
    });

    const ack = await new Promise<{ success: boolean; data?: { text: string } }>((resolve) => {
      clientA.emit(
        'message:send',
        { conversationId: conversation._id.toString(), text: 'Hello Bob!' },
        resolve
      );
    });

    expect(ack.success).toBe(true);
    expect(ack.data?.text).toBe('Hello Bob!');

    const broadcast = (await receivedByB) as { text: string; senderId: { username: string } };
    expect(broadcast.text).toBe('Hello Bob!');
    expect(broadcast.senderId.username).toBe('msgUserA');

    const persisted = await Message.findOne({ conversationId: conversation._id });
    expect(persisted?.text).toBe('Hello Bob!');

    const updatedConversation = await Conversation.findById(conversation._id);
    expect(updatedConversation?.lastMessage?.toString()).toBe(persisted?._id.toString());

    clientA.disconnect();
    clientB.disconnect();
  });

  it('rejects sending to a conversation the user is not a member of (edge case)', async () => {
    const { token: tokenA } = await createUser('msgUserC', 'msguserC@example.com');
    const { user: userB } = await createUser('msgUserD', 'msguserD@example.com');
    const { user: userE } = await createUser('msgUserE', 'msguserE@example.com');

    const conversation = await Conversation.create({ type: '1:1', members: [userB._id, userE._id] });

    const clientA = await connectClient(tokenA);

    const ack = await new Promise<{ success: boolean; message?: string }>((resolve) => {
      clientA.emit(
        'message:send',
        { conversationId: conversation._id.toString(), text: 'Should fail' },
        resolve
      );
    });

    expect(ack.success).toBe(false);
    expect(ack.message).toBe('Conversation not found');

    const count = await Message.countDocuments({ conversationId: conversation._id });
    expect(count).toBe(0);

    clientA.disconnect();
  });

  it('rejects an empty message text with a validation error (edge case)', async () => {
    const { user: userA, token: tokenA } = await createUser('msgUserF', 'msguserF@example.com');
    const { user: userB } = await createUser('msgUserG', 'msguserG@example.com');

    const conversation = await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });
    const clientA = await connectClient(tokenA);

    const ack = await new Promise<{ success: boolean; message?: string }>((resolve) => {
      clientA.emit('message:send', { conversationId: conversation._id.toString(), text: '   ' }, resolve);
    });

    expect(ack.success).toBe(false);
    expect(ack.message).toMatch(/Validation error/);

    clientA.disconnect();
  });

  it('rejects an invalid conversationId format (edge case)', async () => {
    const { token: tokenA } = await createUser('msgUserH', 'msguserH@example.com');
    const clientA = await connectClient(tokenA);

    const ack = await new Promise<{ success: boolean; message?: string }>((resolve) => {
      clientA.emit('message:send', { conversationId: 'not-a-valid-id', text: 'hi' }, resolve);
    });

    expect(ack.success).toBe(false);
    expect(ack.message).toMatch(/Validation error/);

    clientA.disconnect();
  });

  it('strips HTML tags from message text before persisting (XSS sanitization)', async () => {
    const { user: userA, token: tokenA } = await createUser('msgUserI', 'msguserI@example.com');
    const { user: userB } = await createUser('msgUserJ', 'msguserJ@example.com');

    const conversation = await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });
    const clientA = await connectClient(tokenA);

    const ack = await new Promise<{ success: boolean; data?: { text: string } }>((resolve) => {
      clientA.emit(
        'message:send',
        { conversationId: conversation._id.toString(), text: '<script>alert(1)</script>Hello' },
        resolve
      );
    });

    expect(ack.success).toBe(true);
    expect(ack.data?.text).toBe('alert(1)Hello');

    const persisted = await Message.findOne({ conversationId: conversation._id });
    expect(persisted?.text).toBe('alert(1)Hello');
    expect(persisted?.text).not.toMatch(/<script>/);

    clientA.disconnect();
  });

  it('rejects a message consisting only of HTML tags as empty after sanitization (edge case)', async () => {
    const { user: userA, token: tokenA } = await createUser('msgUserK', 'msguserK@example.com');
    const { user: userB } = await createUser('msgUserL', 'msguserL@example.com');

    const conversation = await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });
    const clientA = await connectClient(tokenA);

    const ack = await new Promise<{ success: boolean; message?: string }>((resolve) => {
      clientA.emit(
        'message:send',
        { conversationId: conversation._id.toString(), text: '<b></b>' },
        resolve
      );
    });

    expect(ack.success).toBe(false);
    expect(ack.message).toMatch(/Validation error/);

    clientA.disconnect();
  });
});
