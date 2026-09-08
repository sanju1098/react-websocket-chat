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
  const token = signToken({
    userId: user._id.toString(),
    username: user.username,
    email: user.email,
  });
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

function sendMessage(
  client: ClientSocket,
  conversationId: string,
  text: string
): Promise<{ data: { _id: string } }> {
  return new Promise((resolve) => client.emit('message:send', { conversationId, text }, resolve));
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

describe('message:delivered', () => {
  it('marks a message delivered and broadcasts to the room', async () => {
    const { user: userA, token: tokenA } = await createUser('recvUserA', 'recvusera@example.com');
    const { user: userB, token: tokenB } = await createUser('recvUserB', 'recvuserb@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });
    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);
    await joinRoom(clientA, conversation._id.toString());
    await joinRoom(clientB, conversation._id.toString());

    const sendAck = await sendMessage(clientA, conversation._id.toString(), 'Hi Bob');
    const messageId = sendAck.data._id;

    const receivedByA = new Promise((resolve) => clientA.on('message:delivered', resolve));
    const deliveredAck = await new Promise<{ success: boolean }>((resolve) => {
      clientB.emit('message:delivered', { messageId }, resolve);
    });

    expect(deliveredAck.success).toBe(true);

    const event = (await receivedByA) as { messageId: string; deliveredBy: string };
    expect(event.messageId).toBe(messageId);
    expect(event.deliveredBy).toBe(userB._id.toString());

    const persisted = await Message.findById(messageId);
    expect(persisted?.status).toBe('delivered');

    clientA.disconnect();
    clientB.disconnect();
  });

  it('rejects marking delivery for a message in a conversation the user is not a member of (edge case)', async () => {
    const { user: userA, token: tokenA } = await createUser('recvUserC', 'recvuserc@example.com');
    const { user: userB } = await createUser('recvUserD', 'recvuserd@example.com');
    const { token: tokenE } = await createUser('recvUserE', 'recvusere@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });
    const clientA = await connectClient(tokenA);
    await joinRoom(clientA, conversation._id.toString());
    const sendAck = await sendMessage(clientA, conversation._id.toString(), 'secret');

    const clientE = await connectClient(tokenE);
    const ack = await new Promise<{ success: boolean; message?: string }>((resolve) => {
      clientE.emit('message:delivered', { messageId: sendAck.data._id }, resolve);
    });

    expect(ack.success).toBe(false);
    expect(ack.message).toBe('Message not found');

    clientA.disconnect();
    clientE.disconnect();
  });
});

describe('message:read', () => {
  it('marks messages read up to a given message and broadcasts to the room', async () => {
    const { user: userA, token: tokenA } = await createUser('readUserA', 'readusera@example.com');
    const { user: userB, token: tokenB } = await createUser('readUserB', 'readuserb@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });
    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);
    await joinRoom(clientA, conversation._id.toString());
    await joinRoom(clientB, conversation._id.toString());

    const msg1 = await sendMessage(clientA, conversation._id.toString(), 'Message 1');
    const msg2 = await sendMessage(clientA, conversation._id.toString(), 'Message 2');

    const receivedByA = new Promise((resolve) => clientA.on('message:read', resolve));

    const readAck = await new Promise<{ success: boolean }>((resolve) => {
      clientB.emit(
        'message:read',
        { conversationId: conversation._id.toString(), upToMessageId: msg2.data._id },
        resolve
      );
    });

    expect(readAck.success).toBe(true);

    const event = (await receivedByA) as { messageIds: string[]; readBy: string };
    expect(event.messageIds).toHaveLength(2);
    expect(event.readBy).toBe(userB._id.toString());

    const persisted1 = await Message.findById(msg1.data._id);
    const persisted2 = await Message.findById(msg2.data._id);
    expect(persisted1?.status).toBe('read');
    expect(persisted2?.status).toBe('read');

    clientA.disconnect();
    clientB.disconnect();
  });

  it("does not mark the reader's own messages as read (edge case)", async () => {
    const { user: userA, token: tokenA } = await createUser('readUserC', 'readuserc@example.com');
    const { user: userB } = await createUser('readUserD', 'readuserd@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });
    const clientA = await connectClient(tokenA);
    await joinRoom(clientA, conversation._id.toString());

    const msg1 = await sendMessage(clientA, conversation._id.toString(), 'My own message');

    const ack = await new Promise<{ success: boolean }>((resolve) => {
      clientA.emit(
        'message:read',
        { conversationId: conversation._id.toString(), upToMessageId: msg1.data._id },
        resolve
      );
    });

    expect(ack.success).toBe(true);

    const persisted = await Message.findById(msg1.data._id);
    expect(persisted?.status).toBe('sent');

    clientA.disconnect();
  });

  it('rejects invalid message ID format (edge case)', async () => {
    const { user: userA, token: tokenA } = await createUser('readUserE', 'readusere@example.com');
    const { user: userB } = await createUser('readUserF', 'readuserf@example.com');
    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });

    const clientA = await connectClient(tokenA);
    const ack = await new Promise<{ success: boolean; message?: string }>((resolve) => {
      clientA.emit(
        'message:read',
        { conversationId: conversation._id.toString(), upToMessageId: 'not-valid' },
        resolve
      );
    });

    expect(ack.success).toBe(false);
    expect(ack.message).toMatch(/Validation error/);

    clientA.disconnect();
  });
});
