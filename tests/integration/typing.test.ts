import http from 'http';
import { AddressInfo } from 'net';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import mongoose from 'mongoose';
import app from '../../src/app';
import { initSocketServer } from '../../src/sockets';
import { signToken } from '../../src/utils/jwt';
import User from '../../src/models/User.model';
import Conversation from '../../src/models/Conversation.model';

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
  await Promise.all([User.deleteMany({}), Conversation.deleteMany({})]);
});

afterAll(async () => {
  // Allow any in-flight async presence handlers (triggered by socket
  // disconnects in the preceding tests) to finish before tearing down Mongo.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('typing:start / typing:stop', () => {
  it('broadcasts typing:start to other room members but not to the sender', async () => {
    const { user: userA, token: tokenA } = await createUser('typeUserA', 'typeusera@example.com');
    const { user: userB, token: tokenB } = await createUser('typeUserB', 'typeuserb@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });

    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);

    await joinRoom(clientA, conversation._id.toString());
    await joinRoom(clientB, conversation._id.toString());

    const receivedByB = new Promise((resolve) => clientB.on('typing:start', resolve));
    let receivedBySelf = false;
    clientA.on('typing:start', () => {
      receivedBySelf = true;
    });

    clientA.emit('typing:start', { conversationId: conversation._id.toString() });

    const event = (await receivedByB) as {
      conversationId: string;
      userId: string;
      username: string;
    };
    expect(event.username).toBe('typeUserA');
    expect(event.conversationId).toBe(conversation._id.toString());

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(receivedBySelf).toBe(false);

    clientA.disconnect();
    clientB.disconnect();
  });

  it('broadcasts typing:stop to other room members', async () => {
    const { user: userA, token: tokenA } = await createUser('typeUserC', 'typeuserc@example.com');
    const { user: userB, token: tokenB } = await createUser('typeUserD', 'typeuserd@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });

    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);

    await joinRoom(clientA, conversation._id.toString());
    await joinRoom(clientB, conversation._id.toString());

    const receivedByB = new Promise((resolve) => clientB.on('typing:stop', resolve));
    clientA.emit('typing:stop', { conversationId: conversation._id.toString() });

    const event = (await receivedByB) as { username: string };
    expect(event.username).toBe('typeUserC');

    clientA.disconnect();
    clientB.disconnect();
  });

  it('does not broadcast typing events when the user is not a member (edge case)', async () => {
    const { token: tokenA } = await createUser('typeUserE', 'typeusere@example.com');
    const { user: userB, token: tokenB } = await createUser('typeUserF', 'typeuserf@example.com');
    const { user: userC } = await createUser('typeUserG', 'typeuserg@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userB._id, userC._id],
    });

    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);
    await joinRoom(clientB, conversation._id.toString());

    let received = false;
    clientB.on('typing:start', () => {
      received = true;
    });

    clientA.emit('typing:start', { conversationId: conversation._id.toString() });
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(received).toBe(false);

    clientA.disconnect();
    clientB.disconnect();
  });
});
