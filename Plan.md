
## Implementation Status by Phase

### Phase 0 — Project Setup

> _No phase diagram available for Phase 0._

**What was implemented:**
- TypeScript project scaffold (`tsconfig.json`, strict mode)
- Express app bootstrap with security middlewares: `helmet`, `cors`, JSON body parsing
- HTTP request logging via `morgan` piped into `winston`
- MongoDB connection management (`src/config/db.ts`) with error/disconnect event handling
- Centralized error handling: `AppError` class, 404 handler, global error handler middleware
- `/health` endpoint for readiness checks
- ESLint (`@typescript-eslint`) + Prettier configuration
- Graceful shutdown handling (SIGINT/SIGTERM/unhandledRejection)

**Used for:** Provides the foundational, production-safe HTTP server skeleton that every subsequent phase builds on — consistent error handling, logging, and DB connectivity.

---

### Phase 1 — REST: Auth & Core Data APIs

![Phase 1 — REST: Auth & Core Data APIs](./Phase%201.svg)

**What was implemented:**
- **Mongoose models:**
  - `User` — with bcrypt password hashing, `comparePassword()` instance method, and automatic password-hash stripping on JSON serialization
  - `Conversation` — supports `1:1` and `group` types, tracks `lastMessage` for preview
  - `Message` — with a compound index on `(conversationId, createdAt)` for efficient paginated history queries
- **JWT utilities** (`src/utils/jwt.ts`) — `signToken()` / `verifyToken()`, shared by REST auth today and Socket.io handshake auth in Phase 2
- **Auth middleware** (`src/middlewares/auth.middleware.ts`) — validates `Authorization: Bearer <token>` header, attaches decoded payload to `req.user`
- **Validation middleware** (`src/middlewares/validate.middleware.ts`) — generic Zod-schema validation factory for body/query/params
- **Auth REST API** — signup, login, get current profile (`/api/auth/*`)
- **Conversation REST API** — create conversation (1:1 dedup logic), list user's conversations, paginated message history with cursor-based (`before` timestamp) pagination (`/api/conversations/*`)
- **Zod validators** for signup/login payloads and conversation creation/pagination query params
- **Integration tests** (Jest + Supertest) — 13 tests covering happy paths and edge cases (duplicate email, invalid payload, wrong password, missing/invalid token, non-member access to a conversation, empty message history)

**Used for:** Enables user registration/authentication and conversation/message data access over REST — the foundation that the Socket.io real-time layer (Phase 2+) will build on for actual message delivery.

**API Reference:** See [APIDoc.md](./APIDoc.md) for full endpoint details (request body, headers, response schema, status codes).

---

### Phase 2 — Socket.io Foundation

![Phase 2 — Socket.io Foundation](./Phase%202.svg)

**What was implemented:**
- **Socket.io server initialization** (`src/sockets/index.ts`) — attached to the same HTTP server as Express, with CORS configured from `CLIENT_ORIGIN`; exposes `getSocketServer()` so REST controllers can emit events in later phases
- **Socket handshake JWT auth middleware** (`src/middlewares/socketAuth.middleware.ts`) — reads the token from `socket.handshake.auth.token` (or `Authorization` header as fallback), verifies it, and rejects the connection (`connect_error`) if missing/invalid/expired. On success, attaches the decoded payload to `socket.data.user`
- **Typed Socket.io events** (`src/types/socket.d.ts`) — `ClientToServerEvents`, `ServerToClientEvents`, `SocketData` interfaces for full type-safety on `socket.emit`/`socket.on` calls, extended incrementally in later phases
- **`conversation:join` / `conversation:leave` handlers** (`src/sockets/handlers/connection.handler.ts`) — verifies the authenticated user is a member of the conversation (reusing the `Conversation` model) before allowing `socket.join(conversationId)`; supports acknowledgement callbacks (`{ success, message? }`) so clients get immediate feedback
- **Connection/disconnection logging** — every connect/disconnect is logged with `socket.id`, username, and userId via Winston
- **Integration tests** (Jest + `socket.io-client`) — 6 tests covering: connection rejected with no token, connection rejected with invalid token, connection accepted with valid token, successful room join as a member, rejected room join as a non-member, successful room leave

**Used for:** Establishes the authenticated, room-based real-time transport layer. Every subsequent real-time feature (message send/receive, typing indicators, read receipts, presence) broadcasts through these conversation-scoped Socket.io rooms rather than to individual sockets — this is what allows multiple devices/tabs per user and multiple members per conversation to all receive updates correctly.

**Socket.io Events Reference:** See [APIDoc.md](./APIDoc.md#socketio-events) for connection/auth details and the `conversation:join`/`conversation:leave` event contracts.

---

### Phase 3 — Real-Time Messaging

![Phase 3 — Real-Time Messaging](./Phase%203.svg)

**What was implemented:**
- **`message.service.ts`** (`src/services/message.service.ts`) — verifies the sender is a member of the target conversation, persists the message to MongoDB, updates the conversation's `lastMessage` pointer (and `updatedAt`, so conversation lists sort by most recent activity), and populates sender details (`username`, `email`)
- **`message:send` handler** (`src/sockets/handlers/message.handler.ts`) — validates the payload (Zod), calls the service, broadcasts `message:new` to every socket in the conversation's room (`socket.nsp.to(conversationId).emit(...)`, so the sender's other devices/tabs and all other members receive it), and acknowledges the sender with the persisted, serialized message
- **`message:new` event** — typed server-to-client event carrying the full message payload (`_id`, `conversationId`, `senderId` (populated), `text`, `status`, `createdAt`, `updatedAt`) — same shape as the REST message history response for a single client-side rendering path
- **Zod validator** (`src/validators/message.validator.ts`) — validates `conversationId` (must be a valid ObjectId) and `text` (1–5000 chars, trimmed)
- **Extended typed Socket.io events** (`src/types/socket.d.ts`) — added `SendMessagePayload`, `SocketMessagePayload`, `MessageSendAck` interfaces
- **Integration tests** (Jest + `socket.io-client`) — 4 tests covering: message persisted + broadcast to all room members + conversation `lastMessage` updated (happy path), sender not a member of the conversation (edge case), empty/whitespace-only message text rejected (edge case), invalid `conversationId` format rejected (edge case)

**Used for:** This is the core real-time chat functionality — actual message delivery. Messages sent by any client are durably persisted to MongoDB *before* being broadcast, so message history (via the Phase 1 REST endpoint) and real-time delivery are always consistent, and no message is lost if all recipients are temporarily offline (they'll see it next time they fetch history).

**Socket.io Events Reference:** See [APIDoc.md](./APIDoc.md#socketio-events) for the full `message:send` / `message:new` event contracts (payload, acknowledgement, error cases).

---

### Phase 4 — Typing Indicators & Read Receipts

![Phase 4 — Typing Indicators & Read Receipts](./Phase%204.svg)

**What was implemented:**
- **Shared membership helper** (`isConversationMember()` in `src/services/conversation.service.ts`) — extracted from the Phase 2 connection handler so all Phase 4 handlers (typing, receipts) reuse the same non-throwing membership check instead of duplicating query logic
- **`message:delivered` handler** (`src/sockets/handlers/receipt.handler.ts`) — recipient's client confirms receipt of a message; server validates membership, advances the message status `sent` → `delivered` (never downgrades an already-`read` message), and broadcasts the update to the conversation room so the sender's UI reflects delivery in real time
- **`message:read` handler** (`src/sockets/handlers/receipt.handler.ts`) — marks all unread messages in a conversation up to (and including) a given message as `read`; excludes the reader's own messages (a user can't "read" their own message) and is idempotent (skips already-`read` messages); broadcasts the list of updated message IDs to the room
- **`typing:start` / `typing:stop` handlers** (`src/sockets/handlers/typing.handler.ts`) — ephemeral, non-persisted signals broadcast to *other* room members only (`socket.to()`, excluding the sender, so users never see their own typing indicator echoed back); validates conversation membership before broadcasting, fails silently (no ack) since typing indicators are best-effort UI hints
- **Zod validators** (`src/validators/message.validator.ts`) — `messageDeliveredSchema`, `messageReadSchema`, `typingSchema`
- **Extended typed Socket.io events** (`src/types/socket.d.ts`) — `MessageDeliveredPayload/Event`, `MessageReadPayload/Event`, `TypingPayload`/`TypingEvent`
- **Integration tests** (Jest + `socket.io-client`) — 8 tests: typing broadcast to others but not self, typing:stop broadcast, typing suppressed for non-members (edge case), delivery status update + broadcast (happy path), delivery rejected for non-members (edge case), bulk read receipt + broadcast (happy path), own messages excluded from read receipts (edge case), invalid message ID format rejected (edge case)

**Used for:** Delivers the "is it read?" and "are they typing?" UX that users expect from modern chat apps (iMessage/WhatsApp-style double-checks and typing dots), without polling — all driven by the same conversation-room broadcast pattern established in Phase 2/3.

**Socket.io Events Reference:** See [APIDoc.md](./APIDoc.md#socketio-events) for the full `message:delivered`, `message:read`, `typing:start`/`typing:stop` event contracts.

---

### Phase 5 — Presence (Online/Offline)

![Phase 5 — Presence (Online/Offline)](./Phase%205.svg)

**What was implemented:**
- **`presence.service.ts`** (`src/services/presence.service.ts`) — in-memory, reference-counted active-connection tracking per user (`Map<userId, Set<socketId>>`), supporting multiple simultaneous devices/tabs: a user only flips to `online` on their FIRST connection and only flips to `offline` after their LAST connection closes (opening a 2nd tab doesn't re-trigger `online`; closing one of two tabs doesn't incorrectly mark the user offline)
- **`setUserOnline()` / `setUserOffline()`** — persist `status` to MongoDB; `setUserOffline()` also stamps `lastSeen` to the current time
- **`autoJoinConversationRooms()`** (`src/sockets/handlers/presence.handler.ts`) — every new socket connection automatically joins the Socket.io rooms for all of the user's existing conversations (no manual `conversation:join` needed just to *receive* presence/message/typing/receipt broadcasts — explicit `conversation:join` remains useful for conversations created after connecting, until reconnect)
- **`handleUserConnect()` / `handleUserDisconnect()`** — on first-connection/last-disconnection, update DB status and broadcast `user:online`/`user:offline` (with `lastSeen`) to every conversation room the user belongs to
- **Extended typed Socket.io events** (`src/types/socket.d.ts`) — added `PresenceEvent`, `user:online`/`user:offline` server-to-client events
- **Integration tests** (Jest + `socket.io-client`) — 4 tests: `user:online` broadcast to conversation members on connect, `user:offline` broadcast with `lastSeen` on disconnect, user stays online while any other tab/device remains connected (edge case), presence not broadcast to non-member conversations (edge case)

**Used for:** Gives users the "who's online" / "last seen 5 minutes ago" context that's standard in chat UIs, computed correctly even when a user has multiple tabs/devices open simultaneously — broadcasts are scoped to shared conversations only, so a user's online status is never leaked to strangers.

**Design note (multi-instance caveat):** The connection reference-count is currently **process-local** (an in-memory `Map`). This is correct for a single server instance; if the app is horizontally scaled to multiple instances (Phase 7, Redis adapter), this counter would need to move to a shared store (e.g. Redis) so connection counts stay accurate across instances — called out explicitly in the code for that future migration.

**Socket.io Events Reference:** See [APIDoc.md](./APIDoc.md#socketio-events) for the full `user:online`/`user:offline` event contract.

---

### Phase 6 — Polish
**What was implemented:**
- **Unread message counts** (`listConversations()` in `src/services/conversation.service.ts`) — computed live via a MongoDB aggregation pipeline per call to `GET /api/conversations`; counts messages from OTHER members not yet marked `read`, correctly excluding the caller's own sent messages (mirrors the same exclusion logic used by the Phase 4 `message:read` handler). Returned as a top-level `unreadCount` field alongside each conversation in the REST response.
- **Input sanitization** (`src/utils/sanitize.ts`) — `stripHtmlTags()` strips well-formed HTML tag sequences (`<script>`, `<img onerror>`, etc.) from message text as defense-in-depth XSS mitigation, applied via a Zod `.transform()` in `sendMessageSchema`; length validation runs AFTER sanitization so a tag-only message (e.g. `<b></b>`) is correctly rejected as empty rather than silently persisted as an empty string. **Documented assumption:** this is a server-side safety net, not a substitute for correct client-side rendering — every client must render message text as plain text, never via unescaped `innerHTML`/`dangerouslySetInnerHTML`.
- **Message pagination review** — the cursor-based (`before` timestamp) pagination implemented in Phase 1 (`GET /api/conversations/:id/messages`) was reviewed and confirmed to already satisfy the Phase 6 "infinite scroll" requirement: newest-first ordering, indexed `(conversationId, createdAt)` compound index, `hasMore`/`nextCursor` response fields designed for incremental loading. No changes were needed.
- **API documentation** — added [postman_collection.json](./postman_collection.json), a ready-to-import Postman collection covering every REST endpoint (health, auth, conversations) with pre-configured request bodies and test scripts that auto-capture the JWT token and conversation ID for request chaining. Complements the existing detailed [APIDoc.md](./APIDoc.md) (source of truth for both REST and Socket.io, since Socket.io events aren't Postman-importable).
- **Integration & unit tests** — 11 new tests: unread count is `0` for a conversation with no messages, own sent messages excluded from own unread count (edge case), HTML tags stripped from message text before persistence, tag-only message rejected as empty (edge case), plus 7 unit tests for `stripHtmlTags()` covering script tags, attribute-laden tags, plain punctuation preservation, and empty-input edge cases

**Used for:** Rounds out the core UX expected from a production chat app — unread badges on the conversation list (without a separate polling endpoint) and basic protection against a user pasting malicious markup into a message that gets rendered elsewhere.

**API Reference:** See [APIDoc.md](./APIDoc.md) for the updated `GET /api/conversations` response shape (`unreadCount`) and `message:send` sanitization behavior.

---

### Phase 7 — Redis Adapter, Rate Limiting, Docker, CI/CD
**What was implemented:**

- **Redis adapter for Socket.io** (`src/config/redis.ts`, wired in `src/sockets/index.ts`) — opt-in via `REDIS_ENABLED=true` (defaults to `false` so single-instance local dev/tests don't require a running Redis server). Creates the pub/sub client pair required by `@socket.io/redis-adapter`, enabling events emitted on one server instance (e.g. `message:new`) to be relayed to clients connected to a *different* instance behind a load balancer — the key requirement for horizontally scaling the WebSocket layer.
  - **Concretely verified, not just wired up:** [scripts/verify-redis-scaling.js](./scripts/verify-redis-scaling.js) starts two separate Socket.io server instances sharing one Redis instance, connects one client to each, and proves a message sent via Instance A is received by a client connected to Instance B — confirming cross-instance relay actually works (see verification log in project history).
- **REST rate limiting** (`src/middlewares/rateLimiter.middleware.ts`) — `express-rate-limit` applied to `/api/auth/signup` and `/api/auth/login` (default: 20 requests / 15 min per IP), mitigating brute-force credential guessing and signup spam. Automatically disabled when `NODE_ENV=test` so test suites aren't throttled.
- **Socket.io rate limiting** (`src/middlewares/socketRateLimit.middleware.ts`) — custom sliding-window counter (default: 10 messages / 10s), keyed per **userId** (not socket ID, so a user can't bypass it by opening extra tabs) applied to `message:send`. Returns a clear rate-limit-exceeded error via the ack callback rather than silently dropping the message.
- **Dockerization** (`Dockerfile`, `.dockerignore`, `docker-compose.yml`) — multi-stage build (compile TypeScript in a `build` stage, run only compiled JS + production deps in a slim `production` stage), runs as a non-root user, includes a container `HEALTHCHECK` hitting `/health`. `docker-compose.yml` orchestrates the app + MongoDB + Redis with health-check-gated startup ordering.
  - **Verified, not just written:** built the image and ran the full `docker compose up` stack locally — app container connected successfully to the MongoDB and Redis containers, Socket.io Redis adapter attached, and `/health` responded `200` through the container's exposed port.
- **CI/CD** (`.github/workflows/ci.yml`) — GitHub Actions pipeline: `lint-typecheck-test` job spins up a MongoDB service container, runs ESLint, `tsc --noEmit`, the full Jest suite, and `npm run build` (uploading the `dist/` artifact); a second `docker-build` job (gated on the first job passing) builds the Docker image using Buildx with GitHub Actions layer caching.

**Used for:** These are the "I understand production concerns beyond just making it work" additions — horizontal scalability (Redis adapter), basic abuse prevention (rate limiting on both REST and WebSocket surfaces), reproducible deployable artifacts (Docker), and automated quality gates on every push/PR (CI).

**Design notes (documented limitations, consistent with the rest of this project's honesty about scope):**
- Both the Socket.io rate limiter (this phase) and the presence connection-counter (Phase 5) are currently **process-local in-memory state**. This is correct for a single instance; true multi-instance rate limiting / presence would require migrating these counters to Redis (e.g. `INCR`+`EXPIRE`) — the Redis connection this phase establishes is the natural foundation for that future work, but the migration itself was not in scope for v1.
- REST rate limiting is IP-keyed (the `express-rate-limit` default), which is imprecise behind certain proxy/NAT setups without correctly configured `trust proxy` settings — acceptable for this project's scope, documented for production hardening.

---

All 8 build phases from [Plan.md](./Plan.md) are now complete.
