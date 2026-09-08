# Real-Time Chat — Frontend UI

A basic React + TypeScript + Vite chat UI for the [Real-Time Chat backend](../README.md). Provides login/signup, a conversation list, real-time messaging, typing indicators, delivery/read receipts, and online/offline presence — talking to the backend over REST + Socket.io.

See the [root README](../README.md) for full project setup instructions covering both backend and frontend. Quick start below.

---

## Prerequisites

- Node.js 20.x
- The backend running (see [root README — Backend Setup](../README.md#backend-setup)) at `http://localhost:5000` (or another URL you configure below)

---

## Setup

**1. Install dependencies**

```bash
npm install
```

**2. Configure environment**

```bash
cp .env.example .env
# Defaults to VITE_API_BASE_URL=http://localhost:5000
```

**3. Ensure the backend allows this origin**

The Vite dev server runs on `http://localhost:5173` by default. Set `CLIENT_ORIGIN=http://localhost:5173` in the backend's `.env` (project root) and restart the backend, otherwise REST/Socket.io requests will be blocked by CORS.

**4. Start the dev server**

```bash
npm run dev
```

Open the printed local URL (typically `http://localhost:5173`).

---

## Available Scripts

```bash
npm run dev        # start Vite dev server with HMR
npm run build      # type-check (tsc) + production build to dist/
npm run lint       # ESLint check
npm run preview    # preview the production build locally
```

---

## Project Structure

```
src/
├── components/   # ConversationList, ChatWindow, MessageInput, NewConversationModal
├── pages/        # AuthPage (login/signup), ChatPage (main chat screen)
├── context/      # AuthContext — session state, login/signup/logout, socket lifecycle
├── hooks/        # useAuth, useConversations, useMessages
├── lib/          # api.ts (REST client), socket.ts (Socket.io client)
├── types/        # shared TypeScript types (mirrors backend models)
└── App.tsx       # routes between AuthPage / ChatPage based on session state
```

---

## Environment Variables

| Variable            | Purpose                                    | Default                 |
| ------------------- | ------------------------------------------ | ----------------------- |
| `VITE_API_BASE_URL` | Base URL of the backend (REST + Socket.io) | `http://localhost:5000` |

See [.env.example](./.env.example).

---

## Notes

- "Start new chat" searches users by username (via `GET /api/users?search=`) and creates a 1:1 conversation on selection.
- Styling is intentionally basic/plain CSS per project scope — no CSS framework or design system is used.
- No automated frontend test suite yet; use `npm run build` and `npm run lint` as pre-commit quality gates.
