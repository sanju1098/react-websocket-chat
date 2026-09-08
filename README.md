# Real-Time Chat Application

A resume-worthy, production-style real-time chat application supporting 1:1 and group conversations. Backend built with **Node.js, Express, Socket.io, MongoDB, and TypeScript**; a companion **React + Vite** frontend (`frontend-ui/`) provides a basic chat UI (login/signup, conversation list, real-time messaging, typing indicators, read receipts, presence).

See [Plan.md](./Plan.md) for the full architecture and build-phase roadmap. See [APIDoc.md](./APIDoc.md) for detailed REST API reference (request/response schemas, auth requirements).

---

## Tech Stack

| Layer             | Technology                                                      |
| ----------------- | --------------------------------------------------------------- |
| Language          | TypeScript (strict mode)                                        |
| Backend Framework | Express.js                                                      |
| Frontend          | React 19 + Vite + TypeScript (`frontend-ui/`)                   |
| Real-Time         | Socket.io (+ Redis adapter for horizontal scaling)              |
| Database          | MongoDB (Mongoose ODM)                                          |
| Auth              | JWT (jsonwebtoken, bcrypt)                                      |
| Validation        | Zod                                                             |
| Rate Limiting     | `express-rate-limit` (REST) + custom sliding-window (Socket.io) |
| Logging           | Winston                                                         |
| Testing           | Jest + Supertest + ts-jest                                      |
| Containerization  | Docker (multi-stage) + docker-compose                           |
| CI/CD             | GitHub Actions                                                  |

---

## Project Layout

This is a two-part project — a backend (project root) and a frontend (`frontend-ui/`) — run as two separate processes in local development:

| Part                       | Location              | Runs on                 |
| -------------------------- | --------------------- | ----------------------- |
| Backend (REST + Socket.io) | project root (`src/`) | `http://localhost:5000` |
| Frontend (React UI)        | `frontend-ui/`        | `http://localhost:5173` |

---

## Getting Started

### Prerequisites

| Tool                    | Required? | Notes                                                         |
| ----------------------- | --------- | ------------------------------------------------------------- |
| Node.js 20.x            | Yes       | Matches the CI/Docker runtime                                 |
| MongoDB                 | Yes       | Local install (Homebrew/apt) or via Docker                    |
| Redis                   | Optional  | Only needed for multi-instance scaling (`REDIS_ENABLED=true`) |
| Docker + Docker Compose | Optional  | Alternative to running Mongo/Redis/app natively               |

---

## Backend Setup

### Option A — Run everything locally (Node + native MongoDB)

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

```bash
cp .env.example .env
# Open .env and set a real JWT_SECRET (any long random string for local dev is fine)
```

**3. Start MongoDB** (pick whichever matches your setup)

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Linux (systemd)
sudo systemctl start mongod

# Or run MongoDB directly via Docker (no local install needed)
docker run -d --name mongo -p 27017:27017 mongo:7
```

Verify it's up:

```bash
mongosh --eval "db.adminCommand('ping')"
```

**4. (Optional) Start Redis** — only if you want to test the horizontal-scaling / Redis adapter path

```bash
# macOS (Homebrew)
brew install redis      # first time only
brew services start redis

# Linux (systemd)
sudo apt-get install redis-server   # first time only
sudo systemctl start redis

# Windows (PowerShell with Docker Desktop)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Or via Docker (no local install needed)
docker run -d --name redis -p 6379:6379 redis:7-alpine
```

Verify it's up:

```bash
# Windows PowerShell (when redis-cli is not installed locally)
docker exec redis redis-cli ping   # should reply: PONG

# macOS/Linux
redis-cli ping   # should reply: PONG
```

Then enable it for the app by setting in your `.env`:

```
REDIS_ENABLED=true
REDIS_URL=redis://localhost:6379
```

If you skip this step, leave `REDIS_ENABLED=false` (the default) — the app runs perfectly fine single-instance without Redis.

**5. Start the app**

```bash
# Dev mode (hot-reload via ts-node-dev)
npm run dev

# OR production-style: build once, then run compiled output
npm run build
npm start
```

You should see in the logs:

```
MongoDB connected: localhost
Socket.io running with default in-memory adapter (single instance mode)   <- or "Redis adapter attached" if enabled
Server running on port 5000
Socket.io server initialized and attached
```

**6. Verify it's alive**

```bash
curl http://localhost:5000/health
# {"status":"ok","uptime":...}
```

---

### Option B — Docker Compose (app + MongoDB + Redis, one command)

No local Node/Mongo/Redis installs needed — everything runs in containers.

```bash
# Builds the image and starts app + MongoDB + Redis together
JWT_SECRET=your-secret-here docker compose up --build

# Run in the background instead
JWT_SECRET=your-secret-here docker compose up --build -d

# View logs (if running detached)
docker compose logs -f app

# Stop and remove containers + volumes (fresh state next time)
docker compose down -v
```

The containerized app runs with `REDIS_ENABLED=true` by default (see `docker-compose.yml`), so you get the Redis-adapter-enabled configuration out of the box — no extra setup required. The app is reachable at `http://localhost:5000` exactly the same as Option A.

---

### Backend — other useful scripts

Run from the **project root**:

```bash
npm run dev            # start backend in dev mode (hot-reload via ts-node-dev)
npm run build          # compile TypeScript to dist/
npm start              # run the compiled backend (dist/server.js)
npm test               # run the full test suite once (Jest)
npm run test:watch     # run tests in watch mode
npm run lint           # ESLint check
npm run lint:fix       # ESLint check + auto-fix
npm run format         # Prettier format all files
```

---

## Frontend Setup (`frontend-ui/`)

The React chat UI lives in the [frontend-ui](./frontend-ui) directory and talks to the backend over REST + Socket.io. Make sure the backend (Option A or B above) is already running before starting the frontend.

**1. Install dependencies**

```bash
cd frontend-ui
npm install
```

**2. Configure environment**

```bash
cp .env.example .env
# Defaults to VITE_API_BASE_URL=http://localhost:5000 — update only if your backend runs elsewhere
```

**3. Allow the frontend's origin in the backend CORS config**

The Vite dev server runs on `http://localhost:5173` by default, but the backend's `.env.example` defaults `CLIENT_ORIGIN` to `http://localhost:3000`. Update the backend's `.env` (project root) so Socket.io/CORS accepts requests from the frontend:

```
CLIENT_ORIGIN=http://localhost:5173
```

Restart the backend after changing this.

**4. Start the frontend dev server**

```bash
npm run dev
```

Vite will print the local URL (typically `http://localhost:5173`) — open it in your browser.

**5. Use the app**

- Sign up (or log in) with a username/email/password
- Click **+** in the sidebar to search for another user by name and start a 1:1 chat
- Send messages in real time; typing indicators, delivery/read ticks, and online status update live via Socket.io

### Frontend — other useful scripts

Run from the **`frontend-ui/` directory**:

```bash
npm run dev        # start Vite dev server with HMR
npm run build      # type-check + production build to frontend-ui/dist
npm run lint       # ESLint check
npm run preview    # preview the production build locally
```

---

## Running Both Together (quick reference)

Open two terminals:

```bash
# Terminal 1 — backend (project root)
npm install
cp .env.example .env   # set JWT_SECRET, and CLIENT_ORIGIN=http://localhost:5173
npm run dev            # http://localhost:5000

# Terminal 2 — frontend
cd frontend-ui
npm install
cp .env.example .env   # defaults to http://localhost:5000, adjust if needed
npm run dev            # http://localhost:5173
```

Make sure MongoDB (and optionally Redis) is running before starting the backend — see [Backend Setup](#backend-setup) above.

---

## Using the API (quick walkthrough)

Once the server is running (Option A or B above), here's an end-to-end example of exercising the REST + Socket.io API from a fresh terminal. Full request/response schemas are in [APIDoc.md](./APIDoc.md); a ready-to-import [postman_collection.json](./postman_collection.json) is also available.

**1. Sign up two users**

```bash
curl -s -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","email":"alice@example.com","password":"password123"}'

curl -s -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"username":"bob","email":"bob@example.com","password":"password123"}'
```

Each response includes a `data.token` (JWT) and `data.user._id` — save both for Alice and Bob; you'll need them below.

**2. Log in (alternative to signup, once an account exists)**

```bash
curl -s -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"password123"}'
```

**3. Get the current user's profile**

```bash
curl -s http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <ALICE_TOKEN>"
```

**4. Create a 1:1 conversation** (as Alice, with Bob's `_id`)

```bash
curl -s -X POST http://localhost:5000/api/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ALICE_TOKEN>" \
  -d '{"type":"1:1","members":["<BOB_USER_ID>"]}'
```

Save the returned `data.conversation._id`.

**5. List conversations** (with unread counts)

```bash
curl -s http://localhost:5000/api/conversations \
  -H "Authorization: Bearer <ALICE_TOKEN>"
```

**6. Fetch paginated message history**

```bash
curl -s "http://localhost:5000/api/conversations/<CONVERSATION_ID>/messages?limit=20" \
  -H "Authorization: Bearer <ALICE_TOKEN>"
```

**7. Send/receive real-time messages via Socket.io** (REST alone cannot send messages — use a Socket.io client). Quick Node.js snippet:

```js
// save as try-socket.js, run with: node try-socket.js
const { io } = require('socket.io-client');

const socket = io('http://localhost:5000', {
  auth: { token: '<ALICE_TOKEN>' },
});

socket.on('connect', () => {
  console.log('connected as Alice:', socket.id);

  socket.emit('conversation:join', '<CONVERSATION_ID>', (ack) => {
    console.log('joined room:', ack);

    socket.emit(
      'message:send',
      { conversationId: '<CONVERSATION_ID>', text: 'Hello Bob!' },
      (ack) => console.log('send ack:', ack)
    );
  });
});

socket.on('message:new', (msg) => console.log('new message received:', msg));
socket.on('user:online', (p) => console.log('presence online:', p));
socket.on('typing:start', (p) => console.log('typing:', p));
socket.on('connect_error', (err) => console.error('connect error:', err.message));
```

Run a second copy with Bob's token to see both sides of the conversation (messages, typing indicators, read receipts, presence) in real time. `socket.io-client` is already a project dev dependency, so `node try-socket.js` works from the project root without any extra installs.

> See [APIDoc.md](./APIDoc.md#socketio-events) for the full list of Socket.io events (`message:send`, `message:delivered`, `message:read`, `typing:start`/`stop`, `user:online`/`offline`) with exact payload shapes.

---

## Project Structure

```
src/                  # Backend (Node.js/Express/Socket.io)
├── config/         # env loader, MongoDB connection, Redis adapter clients
├── types/          # global TypeScript declarations (Express.Request, Socket.io events)
├── models/         # Mongoose schemas: User, Conversation, Message
├── validators/      # Zod request-validation schemas
├── middlewares/     # auth, validation, error handling, REST + Socket.io rate limiting
├── services/        # business logic, decoupled from Express
├── controllers/      # HTTP request/response handlers
├── routes/          # Express route definitions
├── sockets/         # Socket.io server init + Redis adapter wiring + event handlers
├── utils/           # JWT signing/verification, logger, HTML sanitization
├── app.ts           # Express app setup
└── server.ts        # HTTP server entry point
tests/                # Backend tests
├── integration/     # Jest + Supertest/socket.io-client tests
└── unit/            # Jest unit tests (pure functions/utilities)
scripts/
└── verify-redis-scaling.js  # manual cross-instance Redis adapter verification
frontend-ui/          # Frontend (React + Vite + TypeScript)
├── src/
│   ├── components/  # ConversationList, ChatWindow, MessageInput, NewConversationModal
│   ├── pages/       # AuthPage (login/signup), ChatPage (main chat screen)
│   ├── context/     # AuthContext — session state, login/signup/logout
│   ├── hooks/       # useAuth, useConversations, useMessages
│   ├── lib/         # api.ts (REST client), socket.ts (Socket.io client)
│   ├── types/       # shared TypeScript types (mirrors backend models)
│   └── App.tsx      # routes between AuthPage / ChatPage based on session
└── vite.config.ts
.github/workflows/
└── ci.yml           # lint -> typecheck -> test -> build -> Docker build pipeline (backend)
```

---

## Environment Variables

### Backend (project root `.env`)

See [.env.example](./.env.example) for the full list. Key variables:

| Variable                      | Purpose                                                        | Default                                                                          |
| ----------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `PORT`                        | HTTP server port                                               | `5000`                                                                           |
| `MONGODB_URI`                 | MongoDB connection string                                      | `mongodb://localhost:27017/realtime-chat`                                        |
| `JWT_SECRET`                  | Secret used to sign/verify JWTs                                | _(required — no safe default in production)_                                     |
| `JWT_EXPIRES_IN`              | JWT expiry duration                                            | `7d`                                                                             |
| `CLIENT_ORIGIN`               | Allowed CORS origin                                            | `http://localhost:3000` (set to `http://localhost:5173` for the Vite dev server) |
| `REDIS_ENABLED`               | Enables the Socket.io Redis adapter for multi-instance scaling | `false`                                                                          |
| `REDIS_URL`                   | Redis connection string (only used if `REDIS_ENABLED=true`)    | `redis://localhost:6379`                                                         |
| `RATE_LIMIT_WINDOW_MS`        | REST auth rate-limit window                                    | `900000` (15 min)                                                                |
| `RATE_LIMIT_MAX_REQUESTS`     | Max REST auth requests per window per IP                       | `20`                                                                             |
| `SOCKET_RATE_LIMIT_MAX`       | Max `message:send` calls per window per user                   | `10`                                                                             |
| `SOCKET_RATE_LIMIT_WINDOW_MS` | Socket.io rate-limit window                                    | `10000` (10s)                                                                    |

### Frontend (`frontend-ui/.env`)

See [frontend-ui/.env.example](./frontend-ui/.env.example). Key variable:

| Variable            | Purpose                                    | Default                 |
| ------------------- | ------------------------------------------ | ----------------------- |
| `VITE_API_BASE_URL` | Base URL of the backend (REST + Socket.io) | `http://localhost:5000` |

---

## Testing

Backend tests (run from the **project root**):

```bash
npm test          # run all tests once
npm run test:watch  # watch mode
```

Integration tests spin up the Express app in-memory (via Supertest) against a real MongoDB instance (`MONGODB_URI_TEST` env var, defaults to `realtime-chat-test` database) and clean up data after each test.

The frontend does not currently have an automated test suite; verify UI changes manually via `npm run dev` in `frontend-ui/`, and run `npm run build`/`npm run lint` (from `frontend-ui/`) as quality gates before committing.
