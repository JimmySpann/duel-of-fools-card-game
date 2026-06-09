# Duel of Fools Card Game

[![Live Demo](https://img.shields.io/badge/Live-Demo-brightgreen?style=for-the-badge)](https://card-game-9dfi.onrender.com/)

A real-time turn-based multiplayer card battle game with custom cards, deck building, AI opponents, and interactive mini-games. Built with React, Redux, Express, Socket.IO, and MongoDB.

> **Try it live:** [https://card-game-9dfi.onrender.com/](https://card-game-9dfi.onrender.com/)

## Features

- **Multiplayer Battles** — 2–6 players in Free-for-All or Team modes
- **Real-Time Gameplay** — Turn-based card battles with live state synchronization via WebSockets
- **AI Opponents** — 5 skill levels from casual to tactical, with greedy lookahead simulation at higher difficulties (Though not very good at the moment)
- **Custom Cards** — Create your own cards with unique abilities, stats, and artwork
- **Deck Builder** — Build and save custom decks from your collection
- **Microgames** — Certain abilities trigger interactive mini-games (QTE, rhythm, pattern match, arrow volley, and more) that boost or reduce ability power based on performance
- **Chat System** — Real-time in-game chat
- **Push Notifications** — Web push support for game invites and updates
- **Background Music** — Auto-playing ambient soundtrack
- **Teams Mode** — Team up with allies and coordinate strategies

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Redux Toolkit, React Router v7, Socket.IO Client |
| **Backend** | Express 4, Socket.IO 4, Mongoose 9, JWT, bcryptjs |
| **Database** | MongoDB |
| **Real-Time** | Socket.IO (game state, chat) |

## Getting Started

### Prerequisites

- Node.js 18+
- MongoDB instance (local or Atlas)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/JimmySpann/duel-of-fools-card-game.git
   cd duel-of-fools-card-game
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install server dependencies**
   ```bash
   cd server
   npm install
   cd ..
   ```

4. **Configure environment variables**

   Copy the example environment file and fill in your values:
   ```bash
   cp server/.env.example server/.env
   ```

   Required variables in `server/.env`:
   ```
   MONGODB_URI=<your-mongodb-connection-string>
   JWT_SECRET=<a-long-random-secret>
   PORT=3001
   ```

### Running Locally

**Start the backend server:**
```bash
npm run server
```

**Start the React development server (in a separate terminal):**
```bash
npm start
```

The React dev server proxies API calls to `localhost:3001` automatically. Open `http://localhost:3000` to play.

### Production Build

```bash
npm run deploy-build
```

This installs all dependencies, builds the React app, and prepares the server for production.

## Deployment

The app is deployed on **Render** and automatically updated on every push to the `main` branch.

- **Live URL:** [https://card-game-9dfi.onrender.com/](https://card-game-9dfi.onrender.com/)
- **CI/CD:** Render detects pushes to GitHub and automatically builds and redeploys using the `npm run deploy-build` script.

### Render Configuration

| Setting | Value |
|---------|-------|
| **Runtime** | Node |
| **Build Command** | `npm run deploy-build` |
| **Start Command** | `npm run server` |
| **Root Directory** | `./` (monorepo root) |

Environment variables (`MONGODB_URI`, `JWT_SECRET`, `PORT`, and optional VAPID keys) are configured in the Render dashboard.

## Project Structure

```
├── server/                          # Express backend
│   ├── index.js                     # Server entry point, middleware, routes
│   ├── gameActions.js               # Socket.IO event wiring for game actions
│   ├── helpers.js                   # Seed data and utilities
│   ├── game/
│   │   ├── engine.js                # Game state machine, turn logic, CPU AI
│   │   └── cards.js                 # Card definitions
│   ├── models/                      # Mongoose schemas
│   │   ├── User.js                  # Authentication and profile
│   │   ├── Session.js               # Game rooms
│   │   ├── Game.js                  # Persistent game states
│   │   ├── Card.js                  # Card definitions
│   │   └── Message.js               # Chat messages
│   ├── routes/                      # REST API endpoints
│   │   ├── auth.js                  # Login / signup
│   │   ├── cards.js                 # Card CRUD
│   │   ├── decks.js                 # Deck CRUD
│   │   ├── sessions.js              # Game room management
│   │   ├── games.js                 # Game state persistence
│   │   ├── messages.js              # Chat history
│   │   ├── profile.js               # User profiles
│   │   └── push.js                  # Web push subscriptions
│   ├── sockets/                     # Socket.IO handlers
│   │   ├── gameSocket.js            # Real-time game actions
│   │   └── chatSocket.js            # Real-time chat
│   └── test/                        # Server tests
│       └── custom-ability-power.test.js
│
├── src/                             # React frontend
│   ├── App.js                       # Root component, routing, socket lifecycle
│   ├── app/
│   │   └── store.js                 # Redux store with online game middleware
│   ├── config/
│   │   └── features.js              # Feature flags and background config
│   ├── features/                    # Redux slices
│   │   ├── auth/                    # Authentication state
│   │   ├── sessions/                # Game room state
│   │   ├── chat/                    # Chat state
│   │   ├── profile/                 # User profile state
│   │   ├── notifications/           # Notification preferences
│   │   └── sound/                   # Audio / music manager
│   ├── sections/                    # UI pages
│   │   ├── auth/                    # Login / signup
│   │   ├── sessions/                # Main menu, lobby, deck builder, card creator, gallery, rules
│   │   └── card-game/               # Game board UI
│   └── shared/
│       └── gameLogic.js             # Shared combat engine (used by client & server)
│
└── public/                          # Static assets
    ├── audio/                       # Sound effects and music
    ├── icons/                       # App icons (PWA)
    └── img/                         # Background images and card artwork
```

## Architecture

### Authoritative Server Model

The server is the single source of truth for all game state. When a player acts:

1. The **client** applies an optimistic update for immediate UI feedback
2. The **action is emitted** to the server via Socket.IO
3. The **server** validates and executes the action through the game engine
4. The **canonical state** is broadcast back to all clients
5. The **client replaces** its local state with the authoritative server state

This is handled transparently by the `onlineGameMiddleware` in the Redux store.

### Shared Game Logic

The core combat engine (`src/shared/gameLogic.js`) is shared between client and server through CommonJS exports. This ensures deterministic behavior — damage calculations, status effects, ability resolution, and hit detection produce identical results on both sides.

### Mini-Games (Microevents)

Certain powerful abilities trigger real-time mini-games on the client, including:

- **QTE** — Quick-time event
- **Pattern Match** — Memorize and reproduce a pattern
- **Quiz** — Answer a trivia question
- **Rhythm** — Tap along to a beat
- **Mash** — Button mashing
- **Parry Chain** — Timed defensive sequence
- **Mana Route** — Draw a path
- **Sigil Recall** — Memory matching
- **Arrow Volley** — Aim and timing

The server holds the action in a pending state until the mini-game result is submitted, then scales the ability's power based on performance.

### CPU AI

The AI engine (`server/game/engine.js`) features 5 skill levels:

| Skill | Behavior |
|-------|----------|
| 1 (Easy) | Random card plays, random target selection |
| 2 (Medium) | Some weighted decisions, still largely random |
| 3 (Hard) | Scored ability/target selection, basic lookahead |
| 4 (Expert) | Greedy lookahead simulation, prioritizes combos and kill shots |
| 5 (Insane) | Near-optimal play, perfect microgame resolution in sim |

At higher skills, the AI simulates multiple action sequences, evaluates resulting board states, and selects the move that maximizes damage output and elimination potential.

## API Overview

### REST Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/signup` | Create account |
| `POST /api/auth/login` | Authenticate, receive JWT |
| `GET /api/profile` | Get current user profile |
| `GET /api/cards` | List cards |
| `POST /api/cards` | Create a custom card |
| `GET /api/decks` | List user's decks |
| `POST /api/decks` | Save a deck |
| `GET /api/sessions` | List active game rooms |
| `POST /api/sessions` | Create a new session |
| `GET /api/sessions/:id` | Get session details |
| `GET /api/games/:id` | Get persisted game state |
| `GET /api/messages` | Chat message history |
| `POST /api/push/subscribe` | Subscribe to push notifications |

### Socket.IO Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| `game:action` | Client → Server | Dispatch a game action |
| `game:state` | Server → Client | Broadcast authoritative state |
| `game:microevent` | Server → Client | Request mini-game resolution |
| `game:microeventResult` | Client → Server | Submit mini-game result |
| `chat:message` | Both | Real-time chat |

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Run React dev server (port 3000) |
| `npm run server` | Run Express server (port 3001) |
| `npm run server:dev` | Build React + start server with hot reload |
| `npm run deploy-build` | Full production build |
| `npm test` | Run client-side tests |
| `cd server && npm test` | Run server-side tests |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret key for JWT signing |
| `PORT` | No | Server port (default: 3001) |
| `VAPID_PUBLIC_KEY` | No | Web push public key |
| `VAPID_PRIVATE_KEY` | No | Web push private key |
| `VAPID_SUBJECT` | No | Web push contact email |

Generate VAPID keys with: `cd server && node scripts/generate-vapid-keys.js`

## License

This project is private.
