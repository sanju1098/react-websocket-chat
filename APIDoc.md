# API Documentation — Real-Time Chat

Base URL (local dev): `http://localhost:5000`

All request/response bodies are JSON. All timestamps are ISO 8601 strings.

> **Postman collection:** A ready-to-import Postman collection covering every REST endpoint below (with auto-captured token/conversationId chaining) is available at [postman_collection.json](./postman_collection.json). Socket.io events are not importable into Postman and remain documented here as the source of truth.

## Conventions

**Success response shape:**

```json
{
  "success": true,
  "data": { ... }
}
```

**Error response shape:**

```json
{
  "success": false,
  "message": "Human-readable error description"
}
```

**Authentication:** Protected endpoints require a JWT in the request header:

```
Authorization: Bearer <token>
```

Tokens are issued by `/api/auth/signup` and `/api/auth/login`, and expire after `JWT_EXPIRES_IN` (default `7d`).

**Rate Limiting (Phase 7):**

| Surface                                     | Limit                           | Keyed by               | Config                                                 |
| ------------------------------------------- | ------------------------------- | ---------------------- | ------------------------------------------------------ |
| REST: `/api/auth/signup`, `/api/auth/login` | 20 requests / 15 min (defaults) | Client IP              | `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`      |
| Socket.io: `message:send`                   | 10 messages / 10s (defaults)    | Authenticated `userId` | `SOCKET_RATE_LIMIT_MAX`, `SOCKET_RATE_LIMIT_WINDOW_MS` |

Exceeding the REST limit returns `429 Too Many Requests` with `{ "success": false, "message": "Too many requests from this IP, please try again later." }`. Exceeding the Socket.io limit returns a failed acknowledgement on `message:send` (see below) rather than disconnecting the socket. Both limiters are disabled during automated tests (`NODE_ENV=test`).

---

## Health Check

### `GET /health`

Returns server liveness status. No auth required.

**Response `200 OK`:**

```json
{
  "status": "ok",
  "uptime": 123.45
}
```

---

## Auth Endpoints (`/api/auth`)

### `POST /api/auth/signup`

Registers a new user account and returns a JWT.

**Auth required:** No

**Request Body:**

| Field      | Type   | Required | Constraints                             |
| ---------- | ------ | -------- | --------------------------------------- |
| `username` | string | Yes      | 3–30 chars, trimmed                     |
| `email`    | string | Yes      | Valid email format, trimmed, lowercased |
| `password` | string | Yes      | 6–72 chars                              |

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "password123"
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "66b8f0c2a1b2c3d4e5f6a7b8",
      "username": "alice",
      "email": "alice@example.com",
      "status": "offline",
      "lastSeen": "2026-09-08T10:00:00.000Z",
      "createdAt": "2026-09-08T10:00:00.000Z",
      "updatedAt": "2026-09-08T10:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

> Note: `passwordHash` is never included in responses (stripped automatically during JSON serialization).

**Error Responses:**

| Status | Condition                                                                                    |
| ------ | -------------------------------------------------------------------------------------------- |
| `400`  | Validation error (e.g., invalid email, password too short)                                   |
| `409`  | Email or username already registered                                                         |
| `429`  | Rate limit exceeded (default: 20 requests / 15 min per IP) — see Rate Limiting section below |

---

### `POST /api/auth/login`

Authenticates an existing user and returns a JWT.

**Auth required:** No

**Request Body:**

| Field      | Type   | Required | Constraints        |
| ---------- | ------ | -------- | ------------------ |
| `email`    | string | Yes      | Valid email format |
| `password` | string | Yes      | Non-empty          |

```json
{
  "email": "alice@example.com",
  "password": "password123"
}
```

**Response `200 OK`:** Same shape as signup (`user` + `token`).

**Error Responses:**

| Status | Condition                                                                                    |
| ------ | -------------------------------------------------------------------------------------------- |
| `400`  | Validation error                                                                             |
| `401`  | Invalid email or password                                                                    |
| `429`  | Rate limit exceeded (default: 20 requests / 15 min per IP) — see Rate Limiting section below |

---

### `GET /api/auth/me`

Returns the currently authenticated user's profile.

**Auth required:** Yes (`Authorization: Bearer <token>`)

**Request Body:** None

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "user": {
      "_id": "66b8f0c2a1b2c3d4e5f6a7b8",
      "username": "alice",
      "email": "alice@example.com",
      "status": "offline",
      "lastSeen": "2026-09-08T10:00:00.000Z",
      "createdAt": "2026-09-08T10:00:00.000Z",
      "updatedAt": "2026-09-08T10:00:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Condition                                                          |
| ------ | ------------------------------------------------------------------ |
| `401`  | Missing/malformed `Authorization` header, or invalid/expired token |
| `404`  | User no longer exists (deleted after token issuance)               |

---

## Conversation Endpoints (`/api/conversations`)

> All endpoints in this section require authentication (`Authorization: Bearer <token>`).

### `POST /api/conversations`

Creates a new conversation. For `1:1` type, reuses an existing conversation between the same two members if one already exists (idempotent).

**Auth required:** Yes

**Request Body:**

| Field     | Type     | Required    | Constraints                                                                                                          |
| --------- | -------- | ----------- | -------------------------------------------------------------------------------------------------------------------- |
| `type`    | string   | Yes         | `"1:1"` or `"group"`                                                                                                 |
| `name`    | string   | Conditional | Required if `type` is `"group"`; 1–100 chars                                                                         |
| `members` | string[] | Yes         | Array of user ObjectIds; min 1 item. For `1:1`, must contain exactly 1 other member (the current user is auto-added) |

```json
{
  "type": "1:1",
  "members": ["66b8f0c2a1b2c3d4e5f6a7c9"]
}
```

```json
{
  "type": "group",
  "name": "Project Team",
  "members": ["66b8f0c2a1b2c3d4e5f6a7c9", "66b8f0c2a1b2c3d4e5f6a7d0"]
}
```

**Response `201 Created`:**

```json
{
  "success": true,
  "data": {
    "conversation": {
      "_id": "66b8f0c2a1b2c3d4e5f6a7e1",
      "type": "1:1",
      "members": ["66b8f0c2a1b2c3d4e5f6a7b8", "66b8f0c2a1b2c3d4e5f6a7c9"],
      "createdAt": "2026-09-08T10:05:00.000Z",
      "updatedAt": "2026-09-08T10:05:00.000Z"
    }
  }
}
```

**Error Responses:**

| Status | Condition                                                                                  |
| ------ | ------------------------------------------------------------------------------------------ |
| `400`  | Validation error (e.g., group without a name, invalid member ObjectId, 1:1 with >1 member) |
| `401`  | Missing/invalid token                                                                      |

---

### `GET /api/conversations`

Lists all conversations the authenticated user is a member of, sorted by most recently updated, with the last message and member profiles populated, and an `unreadCount` computed per conversation.

**Auth required:** Yes

**Request Body:** None

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "conversations": [
      {
        "_id": "66b8f0c2a1b2c3d4e5f6a7e1",
        "type": "1:1",
        "members": [
          {
            "_id": "66b8f0c2a1b2c3d4e5f6a7b8",
            "username": "alice",
            "email": "alice@example.com",
            "status": "offline",
            "lastSeen": "2026-09-08T10:00:00.000Z"
          },
          {
            "_id": "66b8f0c2a1b2c3d4e5f6a7c9",
            "username": "bob",
            "email": "bob@example.com",
            "status": "online",
            "lastSeen": "2026-09-08T10:10:00.000Z"
          }
        ],
        "lastMessage": null,
        "unreadCount": 3,
        "createdAt": "2026-09-08T10:05:00.000Z",
        "updatedAt": "2026-09-08T10:05:00.000Z"
      }
    ]
  }
}
```

**`unreadCount` semantics:** The number of messages in that conversation sent by OTHER members (never the caller's own messages) whose `status` is not yet `read`. Computed live via a MongoDB aggregation on every call (not a denormalized/cached counter) — always accurate, at the cost of one extra aggregation query per `GET /api/conversations` call. Mirrors the same read-exclusion semantics as the `message:read` Socket.io event (see below).

**Error Responses:**

| Status | Condition             |
| ------ | --------------------- |
| `401`  | Missing/invalid token |

---

### `GET /api/conversations/:id/messages`

Fetches paginated message history for a conversation (newest-first), using cursor-based pagination for infinite scroll.

**Auth required:** Yes (must be a member of the conversation)

**Path Params:**

| Param | Type   | Required | Description           |
| ----- | ------ | -------- | --------------------- |
| `id`  | string | Yes      | Conversation ObjectId |

**Query Params:**

| Param    | Type                  | Required | Constraints                                                                                                | Default |
| -------- | --------------------- | -------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| `limit`  | number                | No       | 1–100                                                                                                      | `20`    |
| `before` | string (ISO datetime) | No       | Fetches messages created before this timestamp (use `nextCursor` from previous response for the next page) | —       |

**Example:** `GET /api/conversations/66b8f0c2a1b2c3d4e5f6a7e1/messages?limit=20&before=2026-09-08T10:00:00.000Z`

**Response `200 OK`:**

```json
{
  "success": true,
  "data": {
    "messages": [
      {
        "_id": "66b8f0c2a1b2c3d4e5f6a7f2",
        "conversationId": "66b8f0c2a1b2c3d4e5f6a7e1",
        "senderId": {
          "_id": "66b8f0c2a1b2c3d4e5f6a7b8",
          "username": "alice",
          "email": "alice@example.com"
        },
        "text": "Hey there!",
        "status": "sent",
        "createdAt": "2026-09-08T09:59:00.000Z",
        "updatedAt": "2026-09-08T09:59:00.000Z"
      }
    ],
    "hasMore": false,
    "nextCursor": null
  }
}
```

> Note: In Phase 1, messages can only be read (no send endpoint yet — message creation happens over Socket.io starting Phase 3). This endpoint will typically return an empty array until then.

**Error Responses:**

| Status | Condition                                                                                                        |
| ------ | ---------------------------------------------------------------------------------------------------------------- |
| `400`  | Invalid conversation ID format, or invalid query params (e.g., `limit` out of range)                             |
| `401`  | Missing/invalid token                                                                                            |
| `404`  | Conversation not found, or authenticated user is not a member (same status for both, to avoid leaking existence) |

---

## Data Models Reference

### User

| Field                     | Type                      | Notes                                                                                          |
| ------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| `_id`                     | ObjectId                  |                                                                                                |
| `username`                | string                    | Unique                                                                                         |
| `email`                   | string                    | Unique                                                                                         |
| `status`                  | `"online"` \| `"offline"` | Managed by the Phase 5 presence system — updated automatically on Socket.io connect/disconnect |
| `lastSeen`                | Date                      |                                                                                                |
| `createdAt` / `updatedAt` | Date                      |                                                                                                |

### Conversation

| Field                     | Type                            | Notes                          |
| ------------------------- | ------------------------------- | ------------------------------ |
| `_id`                     | ObjectId                        |                                |
| `type`                    | `"1:1"` \| `"group"`            |                                |
| `name`                    | string \| undefined             | Required for `group`           |
| `members`                 | ObjectId[] / User[] (populated) |                                |
| `lastMessage`             | ObjectId \| Message \| null     | Denormalized for list previews |
| `createdAt` / `updatedAt` | Date                            |                                |

### Message

| Field                     | Type                                  | Notes                           |
| ------------------------- | ------------------------------------- | ------------------------------- |
| `_id`                     | ObjectId                              |                                 |
| `conversationId`          | ObjectId                              |                                 |
| `senderId`                | ObjectId / User (populated)           |                                 |
| `text`                    | string                                | Max 5000 chars                  |
| `status`                  | `"sent"` \| `"delivered"` \| `"read"` | Updated via Socket.io (Phase 4) |
| `createdAt` / `updatedAt` | Date                                  |                                 |

---

## Socket.io Events

Base URL (local dev): `ws://localhost:5000` (Socket.io upgrades automatically from HTTP; no separate path needed — default namespace `/`).

### Connection & Authentication

Every Socket.io connection must present a valid JWT (the same token issued by `POST /api/auth/login` or `/api/auth/signup`) in the handshake. There is no anonymous access.

**Client connection example (socket.io-client):**

```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: '<JWT from login/signup>' },
});

socket.on('connect', () => console.log('connected', socket.id));
socket.on('connect_error', (err) => console.error('auth failed:', err.message));
```

| Handshake field         | Required        | Notes                                                   |
| ----------------------- | --------------- | ------------------------------------------------------- |
| `auth.token`            | Yes (preferred) | Raw JWT, no `Bearer ` prefix                            |
| `headers.authorization` | Fallback        | `Bearer <token>` format, used if `auth.token` is absent |

**Connection outcomes:**

| Outcome                                                                                  | Trigger                                  |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- |
| `connect` event fires                                                                    | Token present and valid                  |
| `connect_error` event fires with `"Authentication required: missing token in handshake"` | No token provided in handshake           |
| `connect_error` event fires with `"Authentication failed: invalid or expired token"`     | Token is malformed, tampered, or expired |

On successful connection, the server attaches the decoded token payload (`{ userId, username, email }`) to the socket's server-side session (`socket.data.user`) — available to all event handlers for that connection.

---

### `conversation:join`

Joins the calling socket to a Socket.io room named after the conversation ID, scoping all future room-broadcast events (message delivery, typing indicators, etc. — Phase 3+) to members only.

**Direction:** Client → Server

**Payload:**

| Argument         | Type     | Required | Description                               |
| ---------------- | -------- | -------- | ----------------------------------------- |
| `conversationId` | string   | Yes      | The `_id` of the conversation to join     |
| `ack`            | function | No       | Optional callback invoked with the result |

**Client emits:**

```js
socket.emit('conversation:join', '66b8f0c2a1b2c3d4e5f6a7e1', (response) => {
  console.log(response); // { success: true } or { success: false, message: '...' }
});
```

**Acknowledgement response:**

```json
{ "success": true }
```

or, if the user is not a member of the conversation:

```json
{ "success": false, "message": "Not a member of this conversation" }
```

---

### `conversation:leave`

Removes the calling socket from the conversation's room. No membership check is performed (leaving is always safe).

**Direction:** Client → Server

**Payload:**

| Argument         | Type     | Required | Description                               |
| ---------------- | -------- | -------- | ----------------------------------------- |
| `conversationId` | string   | Yes      | The `_id` of the conversation to leave    |
| `ack`            | function | No       | Optional callback invoked with the result |

**Client emits:**

```js
socket.emit('conversation:leave', '66b8f0c2a1b2c3d4e5f6a7e1', (response) => {
  console.log(response); // { success: true }
});
```

**Acknowledgement response:**

```json
{ "success": true }
```

---

### `message:send`

Sends a new message to a conversation. The sender must have previously joined the conversation's room via `conversation:join` to receive the broadcast themselves (recommended), though sending does not strictly require having joined — only conversation membership is checked.

**Direction:** Client → Server

**Payload:**

| Field            | Type     | Required | Constraints                                                                                                        |
| ---------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `conversationId` | string   | Yes      | Valid ObjectId of a conversation the sender is a member of                                                         |
| `text`           | string   | Yes      | 1–5000 chars pre-sanitization (trimmed; HTML tags stripped; whitespace-only OR tag-only content rejected as empty) |
| `ack`            | function | No       | Optional callback invoked with the result                                                                          |

**Sanitization:** `text` is HTML-tag-stripped server-side before persistence/broadcast (defense-in-depth XSS mitigation — e.g. `<script>alert(1)</script>Hi` is stored/broadcast as `alert(1)Hi`). This does **not** replace proper client-side rendering: every client MUST render message text as plain text (never via `innerHTML`/`dangerouslySetInnerHTML` without escaping).

**Client emits:**

```js
socket.emit(
  'message:send',
  { conversationId: '66b8f0c2a1b2c3d4e5f6a7e1', text: 'Hello!' },
  (response) => console.log(response)
);
```

**Acknowledgement response (success):**

```json
{
  "success": true,
  "data": {
    "_id": "66b8f0c2a1b2c3d4e5f6a7f2",
    "conversationId": "66b8f0c2a1b2c3d4e5f6a7e1",
    "senderId": {
      "_id": "66b8f0c2a1b2c3d4e5f6a7b8",
      "username": "alice",
      "email": "alice@example.com"
    },
    "text": "Hello!",
    "status": "sent",
    "createdAt": "2026-09-08T10:15:00.000Z",
    "updatedAt": "2026-09-08T10:15:00.000Z"
  }
}
```

**Acknowledgement response (error):**

```json
{ "success": false, "message": "Conversation not found" }
```

```json
{ "success": false, "message": "Validation error: text: Message text cannot be empty" }
```

**Error cases (returned via `ack`, not `connect_error`):**

| `message`                                                         | Condition                                                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `Validation error: conversationId: Invalid ObjectId`              | `conversationId` is not a valid ObjectId format                                                           |
| `Validation error: text: Message text cannot be empty`            | `text` is empty or whitespace-only (including after HTML tag stripping)                                   |
| `Conversation not found`                                          | Conversation doesn't exist, or sender is not a member (same message for both, to avoid leaking existence) |
| `Rate limit exceeded: max 10 messages per 10s. Please slow down.` | Sender exceeded the per-user `message:send` rate limit — see Rate Limiting section below                  |
| `Failed to send message`                                          | Unexpected server error                                                                                   |

---

### `message:new`

Broadcast automatically by the server to every socket currently in the conversation's room (all members' active connections, including the sender's other devices/tabs) immediately after a message is persisted.

**Direction:** Server → Client

**Client listens:**

```js
socket.on('message:new', (message) => {
  console.log('New message:', message);
});
```

**Payload:** Identical shape to the `data` field in the `message:send` acknowledgement above (`_id`, `conversationId`, `senderId` (populated), `text`, `status`, `createdAt`, `updatedAt`).

> **Note:** Only sockets that have called `conversation:join` for that conversation ID will receive this event — join the room first (see `conversation:join` above) before sending/expecting messages.

---

### `message:delivered`

Confirms that a recipient's client has received a message. Advances the message's `status` from `sent` to `delivered` (never downgrades an already-`read` message).

**Direction:** Client → Server

**Payload:**

| Field       | Type     | Required | Constraints                                                             |
| ----------- | -------- | -------- | ----------------------------------------------------------------------- |
| `messageId` | string   | Yes      | Valid ObjectId of a message in a conversation the caller is a member of |
| `ack`       | function | No       | Optional callback invoked with the result                               |

**Client emits:**

```js
socket.emit('message:delivered', { messageId: '66b8f0c2a1b2c3d4e5f6a7f2' }, (response) => {
  console.log(response); // { success: true }
});
```

**Acknowledgement response:**

```json
{ "success": true }
```

**Error cases:**

| `message`               | Condition                                                            |
| ----------------------- | -------------------------------------------------------------------- |
| `Validation error: ...` | `messageId` is not a valid ObjectId                                  |
| `Message not found`     | Message doesn't exist, or caller is not a member of its conversation |

---

### `message:delivered` (broadcast)

Emitted by the server to every socket in the conversation's room after a successful `message:delivered` call — lets the original sender's UI show a "delivered" checkmark in real time.

**Direction:** Server → Client

**Client listens:**

```js
socket.on('message:delivered', (payload) => console.log(payload));
```

**Payload:**

```json
{
  "messageId": "66b8f0c2a1b2c3d4e5f6a7f2",
  "conversationId": "66b8f0c2a1b2c3d4e5f6a7e1",
  "deliveredBy": "66b8f0c2a1b2c3d4e5f6a7c9"
}
```

---

### `message:read`

Marks all unread messages in a conversation, up to and including a given message, as `read` by the calling user. Excludes the caller's own messages (a user can't "read" their own message) and is idempotent (already-`read` messages are skipped).

**Direction:** Client → Server

**Payload:**

| Field            | Type     | Required | Constraints                                                                                                                    |
| ---------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `conversationId` | string   | Yes      | Valid ObjectId; caller must be a member                                                                                        |
| `upToMessageId`  | string   | Yes      | Valid ObjectId of a message within that conversation; marks this message and all earlier unread messages (from others) as read |
| `ack`            | function | No       | Optional callback invoked with the result                                                                                      |

**Client emits:**

```js
socket.emit(
  'message:read',
  { conversationId: '66b8f0c2a1b2c3d4e5f6a7e1', upToMessageId: '66b8f0c2a1b2c3d4e5f6a7f5' },
  (response) => console.log(response)
);
```

**Acknowledgement response:**

```json
{ "success": true }
```

**Error cases:**

| `message`                | Condition                                                   |
| ------------------------ | ----------------------------------------------------------- |
| `Validation error: ...`  | `conversationId` or `upToMessageId` is not a valid ObjectId |
| `Conversation not found` | Caller is not a member of the conversation                  |
| `Message not found`      | `upToMessageId` doesn't belong to the given conversation    |

---

### `message:read` (broadcast)

Emitted by the server to every socket in the conversation's room after messages are marked read — only fires if at least one message's status actually changed. Lets the sender's UI show "read" indicators.

**Direction:** Server → Client

**Client listens:**

```js
socket.on('message:read', (payload) => console.log(payload));
```

**Payload:**

```json
{
  "conversationId": "66b8f0c2a1b2c3d4e5f6a7e1",
  "messageIds": ["66b8f0c2a1b2c3d4e5f6a7f2", "66b8f0c2a1b2c3d4e5f6a7f5"],
  "readBy": "66b8f0c2a1b2c3d4e5f6a7c9"
}
```

---

### `typing:start` / `typing:stop`

Ephemeral, non-persisted typing indicator signals. Broadcast to every **other** member of the conversation's room (the sender never receives their own typing event back). No acknowledgement is sent — these are fire-and-forget, best-effort UI hints; invalid payloads or non-member senders are silently ignored (logged server-side, not surfaced to the client).

**Direction:** Client → Server (and Server → Client, re-broadcast)

**Payload:**

| Field            | Type   | Required | Constraints                                                |
| ---------------- | ------ | -------- | ---------------------------------------------------------- |
| `conversationId` | string | Yes      | Valid ObjectId; caller must be a member (checked silently) |

**Client emits:**

```js
socket.emit('typing:start', { conversationId: '66b8f0c2a1b2c3d4e5f6a7e1' });
// ...user stops typing (e.g. after a debounce timeout)...
socket.emit('typing:stop', { conversationId: '66b8f0c2a1b2c3d4e5f6a7e1' });
```

**Other room members receive:**

```js
socket.on('typing:start', (payload) => console.log(payload));
socket.on('typing:stop', (payload) => console.log(payload));
```

**Broadcast payload:**

```json
{
  "conversationId": "66b8f0c2a1b2c3d4e5f6a7e1",
  "userId": "66b8f0c2a1b2c3d4e5f6a7c9",
  "username": "bob"
}
```

> **Client implementation tip:** debounce `typing:stop` (e.g. emit it automatically ~2–3 seconds after the last `typing:start` with no further input) rather than relying solely on blur/submit events.

---

### `user:online` / `user:offline`

Broadcast automatically by the server to every conversation room a user belongs to when their online status changes. A user is considered `online` from their FIRST active connection (across all devices/tabs) and `offline` only after their LAST active connection disconnects — opening a second tab does not re-trigger `user:online`, and closing one of several open tabs does not trigger `user:offline`.

Note: joining a conversation's room happens automatically for every socket on connect (for all of the user's _existing_ conversations at connect time) — no explicit `conversation:join` call is required just to receive presence events for those conversations.

**Direction:** Server → Client

**Client listens:**

```js
socket.on('user:online', (payload) => console.log(`${payload.username} is online`));
socket.on('user:offline', (payload) =>
  console.log(`${payload.username} last seen ${payload.lastSeen}`)
);
```

**Payload (both events):**

```json
{
  "userId": "66b8f0c2a1b2c3d4e5f6a7c9",
  "username": "bob",
  "status": "online",
  "lastSeen": "2026-09-08T10:20:00.000Z"
}
```

| Field      | Type                      | Notes                                                                                                                           |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `userId`   | string                    | The user whose status changed                                                                                                   |
| `username` | string                    | Denormalized for convenient UI rendering without an extra lookup                                                                |
| `status`   | `"online"` \| `"offline"` | Matches the event name (`user:online` → `"online"`, `user:offline` → `"offline"`)                                               |
| `lastSeen` | string (ISO datetime)     | Updated timestamp; for `user:online` this is the previous `lastSeen` value, for `user:offline` it's the moment of disconnection |

> **Scope:** Only broadcast to conversations the affected user is a member of — users never see presence updates for people they don't share a conversation with.

---

## Changelog

| Phase   | Endpoints / Events Added                                                                                                                                                                                                                                                                  |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | `GET /health`                                                                                                                                                                                                                                                                             |
| Phase 1 | `POST /api/auth/signup`, `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/conversations`, `GET /api/conversations`, `GET /api/conversations/:id/messages`                                                                                                                           |
| Phase 2 | Socket.io connection + handshake JWT auth, `conversation:join`, `conversation:leave`                                                                                                                                                                                                      |
| Phase 3 | `message:send`, `message:new`                                                                                                                                                                                                                                                             |
| Phase 4 | `message:delivered`, `message:read`, `typing:start`, `typing:stop`                                                                                                                                                                                                                        |
| Phase 5 | `user:online`, `user:offline`                                                                                                                                                                                                                                                             |
| Phase 6 | `unreadCount` field added to `GET /api/conversations`; HTML sanitization added to `message:send`; Postman collection added (no new endpoints/events)                                                                                                                                      |
| Phase 7 | Rate limiting added to `/api/auth/signup`, `/api/auth/login`, and `message:send` (`429` / rate-limit ack errors); Redis adapter for Socket.io (opt-in, no API contract changes); Dockerfile, docker-compose.yml, GitHub Actions CI added (infrastructure only, no endpoint/event changes) |
