/**
 * Manual verification script (NOT part of the automated test suite) for
 * Phase 7's Redis adapter horizontal-scaling claim.
 *
 * Starts TWO separate HTTP+Socket.io server instances (simulating two
 * Node.js processes behind a load balancer), each with the Redis adapter
 * enabled and pointed at the SAME Redis instance. Connects one client to
 * each instance, joins both to the same conversation room, sends a message
 * via the client connected to Instance A, and asserts that the client
 * connected to Instance B receives the `message:new` broadcast — proving
 * the event was relayed cross-instance via Redis pub/sub, not just
 * delivered via a single in-process EventEmitter.
 *
 * Usage: REDIS_ENABLED=true node scripts/verify-redis-scaling.js
 * Requires: a running MongoDB and Redis instance (see .env).
 */
require('ts-node/register');
const http = require('http');
const { io: ioClient } = require('socket.io-client');
const mongoose = require('mongoose');

process.env.REDIS_ENABLED = 'true';

async function main() {
  const { connectDB } = require('../src/config/db');
  const { initSocketServer } = require('../src/sockets');
  const { signToken } = require('../src/utils/jwt');
  const User = require('../src/models/User.model').default;
  const Conversation = require('../src/models/Conversation.model').default;

  await connectDB();

  // Clean slate for repeatable runs
  await User.deleteMany({ email: /redis-scaling-test/ });

  const userA = await User.create({
    username: `rsA_${Date.now()}`,
    email: `redis-scaling-test-a-${Date.now()}@example.com`,
    passwordHash: 'irrelevant',
  });
  const userB = await User.create({
    username: `rsB_${Date.now()}`,
    email: `redis-scaling-test-b-${Date.now()}@example.com`,
    passwordHash: 'irrelevant',
  });
  const conversation = await Conversation.create({
    type: '1:1',
    members: [userA._id, userB._id],
  });

  const tokenA = signToken({ userId: userA._id.toString(), username: userA.username, email: userA.email });
  const tokenB = signToken({ userId: userB._id.toString(), username: userB.username, email: userB.email });

  // --- Instance A ---
  const httpServerA = http.createServer();
  await initSocketServer(httpServerA);
  await new Promise((resolve) => httpServerA.listen(0, resolve));
  const portA = httpServerA.address().port;

  // --- Instance B (separate Socket.io Server object, same Redis) ---
  const httpServerB = http.createServer();
  await initSocketServer(httpServerB);
  await new Promise((resolve) => httpServerB.listen(0, resolve));
  const portB = httpServerB.address().port;

  console.log(`Instance A listening on :${portA}`);
  console.log(`Instance B listening on :${portB}`);

  const clientA = ioClient(`http://localhost:${portA}`, { auth: { token: tokenA }, transports: ['websocket'] });
  const clientB = ioClient(`http://localhost:${portB}`, { auth: { token: tokenB }, transports: ['websocket'] });

  await Promise.all([
    new Promise((resolve, reject) => {
      clientA.on('connect', resolve);
      clientA.on('connect_error', reject);
    }),
    new Promise((resolve, reject) => {
      clientB.on('connect', resolve);
      clientB.on('connect_error', reject);
    }),
  ]);
  console.log('Both clients connected (to DIFFERENT server instances).');

  await Promise.all([
    new Promise((resolve) => clientA.emit('conversation:join', conversation._id.toString(), resolve)),
    new Promise((resolve) => clientB.emit('conversation:join', conversation._id.toString(), resolve)),
  ]);
  console.log('Both clients joined the conversation room on their respective instances.');

  const receivedOnB = new Promise((resolve) => clientB.on('message:new', resolve));

  console.log('Sending message via client A (connected to Instance A)...');
  const ack = await new Promise((resolve) =>
    clientA.emit('message:send', { conversationId: conversation._id.toString(), text: 'Cross-instance hello!' }, resolve)
  );
  console.log('Instance A ack:', ack);

  const message = await Promise.race([
    receivedOnB,
    new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT: message:new not received on Instance B within 5s')), 5000)),
  ]);

  console.log('\nSUCCESS: Client B (connected to Instance B) received message:new relayed via Redis from Instance A:');
  console.log(JSON.stringify(message, null, 2));

  clientA.disconnect();
  clientB.disconnect();
  await new Promise((resolve) => httpServerA.close(resolve));
  await new Promise((resolve) => httpServerB.close(resolve));
  await mongoose.connection.close();
  process.exit(0);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
