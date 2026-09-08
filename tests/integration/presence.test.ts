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

function waitFor<T>(client: ClientSocket, event: string): Promise<T> {
  return new Promise((resolve) => client.once(event, resolve));
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe('Presence: user:online / user:offline', () => {
  it('broadcasts user:online to conversation members when a user connects', async () => {
    const { user: userA, token: tokenA } = await createUser('presUserA', 'presusera@example.com');
    const { user: userB, token: tokenB } = await createUser('presUserB', 'presuserb@example.com');

    await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });

    const clientB = await connectClient(tokenB);
    await wait(100); // ensure clientB's server-side auto-join to the room completes

    const onlinePromise = waitFor<{ userId: string; username: string; status: string }>(
      clientB,
      'user:online'
    );

    const clientA = await connectClient(tokenA);
    const event = await onlinePromise;

    expect(event.userId).toBe(userA._id.toString());
    expect(event.username).toBe('presUserA');
    expect(event.status).toBe('online');

    const dbUser = await User.findById(userA._id);
    expect(dbUser?.status).toBe('online');

    clientA.disconnect();
    clientB.disconnect();
    await wait(100);
  });

  it('broadcasts user:offline with lastSeen when a user disconnects', async () => {
    const { user: userA, token: tokenA } = await createUser('presUserC', 'presuserc@example.com');
    const { user: userB, token: tokenB } = await createUser('presUserD', 'presuserd@example.com');

    await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });

    const clientA = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);
    await wait(100);

    const offlinePromise = waitFor<{ userId: string; status: string; lastSeen: string }>(
      clientB,
      'user:offline'
    );

    clientA.disconnect();
    const event = await offlinePromise;

    expect(event.userId).toBe(userA._id.toString());
    expect(event.status).toBe('offline');
    expect(event.lastSeen).toEqual(expect.any(String));

    const dbUser = await User.findById(userA._id);
    expect(dbUser?.status).toBe('offline');

    clientB.disconnect();
    await wait(100);
  });

  it('does not go offline while another tab/device for the same user remains connected (edge case)', async () => {
    const { user: userA, token: tokenA } = await createUser('presUserE', 'presusere@example.com');
    const { user: userB, token: tokenB } = await createUser('presUserF', 'presuserf@example.com');

    await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });

    const clientA1 = await connectClient(tokenA);
    const clientA2 = await connectClient(tokenA);
    const clientB = await connectClient(tokenB);
    await wait(150);

    let offlineReceived = false;
    clientB.on('user:offline', () => {
      offlineReceived = true;
    });

    clientA1.disconnect();
    await wait(150);

    expect(offlineReceived).toBe(false);

    const dbUser = await User.findById(userA._id);
    expect(dbUser?.status).toBe('online');

    clientA2.disconnect();
    clientB.disconnect();
    await wait(100);
  });

  it('does not broadcast presence to conversations the user is not a member of (edge case)', async () => {
    const { user: userA } = await createUser('presUserG', 'presuserg@example.com');
    const { user: userB, token: tokenB } = await createUser('presUserH', 'presuserh@example.com');
    const { token: tokenC } = await createUser('presUserI', 'presuseri@example.com');

    await Conversation.create({ type: '1:1', members: [userA._id, userB._id] });

    const clientC = await connectClient(tokenC);
    let received = false;
    clientC.on('user:online', () => {
      received = true;
    });

    const clientB = await connectClient(tokenB);
    await wait(150);

    expect(received).toBe(false);

    clientB.disconnect();
    clientC.disconnect();
    await wait(100);
  });
});
