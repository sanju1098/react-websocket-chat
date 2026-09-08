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

describe('Socket.io connection auth', () => {
  it('rejects connection without a token (edge case)', async () => {
    await expect(
      new Promise((resolve, reject) => {
        const client = ioClient(`http://localhost:${port}`, {
          transports: ['websocket'],
          forceNew: true,
        });
        client.on('connect', () => resolve('connected'));
        client.on('connect_error', (err) => reject(err));
      })
    ).rejects.toThrow();
  });

  it('rejects connection with an invalid token (edge case)', async () => {
    await expect(connectClient('invalid.token.here')).rejects.toThrow();
  });

  it('accepts connection with a valid token', async () => {
    const { token } = await createUser('socketuser1', 'socketuser1@example.com');
    const client = await connectClient(token);
    expect(client.connected).toBe(true);
    client.disconnect();
  });
});

describe('conversation:join / conversation:leave', () => {
  it('joins a room successfully when the user is a member', async () => {
    const { user: userA, token: tokenA } = await createUser('joinUserA', 'joinusera@example.com');
    const { user: userB } = await createUser('joinUserB', 'joinuserb@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });

    const client = await connectClient(tokenA);

    const ack = await new Promise((resolve) => {
      client.emit('conversation:join', conversation._id.toString(), resolve);
    });

    expect(ack).toEqual({ success: true });
    client.disconnect();
  });

  it('rejects joining a room when the user is not a member (edge case)', async () => {
    const { token: tokenA } = await createUser('joinUserC', 'joinuserc@example.com');
    const { user: userB } = await createUser('joinUserD', 'joinuserd@example.com');
    const { user: userE } = await createUser('joinUserE', 'joinusere@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userB._id, userE._id],
    });

    const client = await connectClient(tokenA);

    const ack = await new Promise((resolve) => {
      client.emit('conversation:join', conversation._id.toString(), resolve);
    });

    expect(ack).toEqual({ success: false, message: 'Not a member of this conversation' });
    client.disconnect();
  });

  it('leaves a room successfully', async () => {
    const { user: userA, token: tokenA } = await createUser('leaveUserA', 'leaveusera@example.com');
    const { user: userB } = await createUser('leaveUserB', 'leaveuserb@example.com');

    const conversation = await Conversation.create({
      type: '1:1',
      members: [userA._id, userB._id],
    });

    const client = await connectClient(tokenA);
    await new Promise((resolve) =>
      client.emit('conversation:join', conversation._id.toString(), resolve)
    );

    const leaveAck = await new Promise((resolve) => {
      client.emit('conversation:leave', conversation._id.toString(), resolve);
    });

    expect(leaveAck).toEqual({ success: true });
    client.disconnect();
  });
});
