# Who Said That? 🎭

A real-time multiplayer party game built with React, Node.js, and Socket.io! The concept is simple: everyone answers a question anonymously, and then players vote to guess who wrote which answer. 

## Features
- **Real-Time Multiplayer:** Built with Socket.io for instant synchronization across all devices.
- **Custom Questions:** Play with pre-installed questions or add your own in Custom Mode while waiting in the lobby.
- **Scoring System:**
  - +1 Point for correctly guessing the author.
  - 0 Points when people guess your own answer.
  - -1 Point for an incorrect guess.
- **Interactive Voting Flow:** See the votes roll in, then reveal the authors one by one manually for maximum suspense.
- **Podium Celebration:** End the game with your friends on a beautiful confetti-filled animated screen.

## Project Structure
This is a monorepo containing both the client and server code.
- `/client`: React frontend built with Vite and styled with TailwindCSS.
- `/server`: Node.js backend using Express and Socket.io.

## Quick Start 🚀

### 1. Install Dependencies
You need to install dependencies for both the client and server.
```bash
# In the terminal, go to the client folder to install frontend packages:
cd client
npm install

# In a separate terminal, go to the server folder:
cd server
npm install
```

### 2. Run the Servers
Both backend and frontend must run concurrently.
```bash
# Start the Backend Server (from the /server directory)
node index.js

# Start the Frontend App (from the /client directory)
npm run dev
```

### 3. Play!
Open your browser to the local address provided by Vite (usually `http://localhost:5173`).
Share the Room Code with your friends so they can join! The Host controls the flow of the game!

## How to Play
1. **Join the Lobby**: Enter a nickname. If you create the room, you are the **Host**. Share the 4-letter Code with your friends to join.
2. **Answer the Prompt**: When a round starts, everyone gets the same prompt (e.g., "What is your biggest fear?"). Type an answer anonymously.
3. **Voting Phase**: The game gathers all answers and presents them randomly. Read other players' answers and cast your vote for who you think wrote it!
4. **The Reveal**: The Host will click "Show Answer" to reveal the true author of the answer. You get +1 for clicking the right name, and -1 if you guessed wrong!
5. **Winner**: At the end of the specified number of rounds, whoever has the most points wins!

## Testing 🧪

```bash
npm test --prefix server          # server unit tests (Jest)
npm test --prefix client          # client unit tests (Vitest)
npm run test:regression           # multiplayer regression suite (Playwright, 1 TV + 3 phones)
```

`npm run test:regression` starts the server and the Vite client itself (or reuses ones that are already running) and drives real browsers:

| Spec | Covers |
|---|---|
| `tests/regression/games.spec.js` | Happy path of every game: intro → full game → shared end screen. `GAMES=caption,drawing` to pick games. |
| `tests/regression/playlist.spec.js` | One playlist containing every game, advanced with "▶ Next" to the final party scoreboard (slow). `PLAYLIST=pmatch,caption` to shorten it. |
| `tests/regression/lifecycle.spec.js` | Refresh mid-round, a player leaving for good, late joiners, TV refresh / view-only screens, hosting from a phone. |
| `tests/regression/timers.spec.js` | Timer expiry advances the game; the host's Continue; one timer on screen. |
| `tests/regression/server-robustness.spec.js` | Malformed socket payloads can't crash the server; host-only advance guards. |

Run one file with `npm run test:regression -- lifecycle`.

## How to add a new mini-game 🧩

Every game gets the **intro screen, the round timer, the confirm button, the "waiting for…" list, host controls and the end screen from the framework**. A new game only provides its own gameplay screens and server logic. Follow these steps so it stays consistent with the others (see `AUDIT.md` §6 for the rules behind them).

### 1. Register it (one place per side)

- **`client/src/games/registry.js`**: add `{ id, icon, accent, name: {en, fr, he}, rules: {en, fr, he}, tagline, start }`. Pickers, playlists, the intro screen, the end screen and "▶ Next:" labels all read this.
- **`server/game/registry.js`**: add `{ id, standalone, startEvent }`. The start event is what the intro gate intercepts.

### 2. Server

- **Start handler.** Start it with `requireMinPlayers(socket, room, id)` and `clampRounds(rounds)` from `server/game/rules.js`. You get the intro screen automatically: the intro gate (`server/game/intro.js`) parks your start event until everyone is ready, then replays it to your handler.
- **Who plays.** Use `getActivePlayers(room)` (`server/game/players.js`) for "who is expected this round". Call `admitLateJoiners(io, room)` at the start of every round.
- **Collecting answers and votes.** Use `SubmissionTracker` / `VoteCollector` with `getExpectedIds: () => getActivePlayers(room).map(p => p.id)`. Never compare raw counts: a player who leaves must neither block nor complete a phase. Disconnects re-check thresholds for you.
- **Timers.** Time every phase that waits on players with `startPhaseTimer(io, room, code, { key, seconds, phase, isActive, onExpire })` (`server/game/phaseTimer.js`). This gives the TV and the phone host Pause / Continue for free, and the phones' shell timer shows the countdown.
- **Host-only advances.** Check `player.isHost` and the phase/state you advance *from*, so a double click can't skip content.
- **Game over.** Set an end phase (`room.phase = '<game>End'`) and add it to `server/game/canonicalRoute.js`. Call `mergeToGlobalScores(io, room, scores)` so playlist totals include your game.
- **Runtime helpers.** Keep them under `_`-prefixed keys (e.g. `room.mygame._voteCollector`). They are not persisted; handle their absence after a restart.

### 3. Client (phones)

- **Phase mapping.** Add your events to `client/src/game-core/phaseEvents.js` (event → room phase), and your routes to `usePhaseSync.js` (`PHASE_ROUTES`) and `utils/rejoinState.js` (`getRouteForPhase`).
- **Text, prompt and drawing inputs.** Wrap them in **`MiniGameWrapper`** + `useMiniGameLifecycle`. You get: Submit disabled while empty, the input locked after Submit, Edit when your game allows changes, and "waiting for …".
- **Votes and choices.** Use **`useVoteConfirmation`** (or a pending state) + **`ConfirmVoteCard`**, then **`VoteLocked`** once confirmed. Call `useAutoConfirmPending({ pending, hasVoted, onConfirm })` so a pick made before time runs out is still sent.
- **Change rule.** A pick can be changed freely until Confirm. Text and drawings can be edited until the phase closes. Votes are final.
- **Timers.** Do **not** draw your own timer. The shell's `GameTimer` shows every server tick event, and pages must not render a second countdown.
- **Results.** Show "Waiting for the host…" to non-hosts and a single-flight Next button (`useSingleFlight`) to the host.
- **End screen.** Use **`GameEndShell`**. It shows host-only buttons only to the host, and its Main Menu leaves the room.
- **Strings and layout.**
  - Put every string in `client/src/locales/translations.js` (en / fr / he); shared UI strings live under `common`.
  - Use logical CSS (`ms-`/`me-`/`text-start`) so Hebrew mirrors.
  - Wrap user text with `[overflow-wrap:anywhere]`.
  - Design for 360px wide, with the top bar above your page.

### 4. TV (host screen)

- **Panel.** Add a panel for your statuses in `client/src/pages/HostPage.jsx`.
- **Timed phases.** Add their `phase` labels to `TIMED_PHASES`, so the control bar shows the countdown with Pause / Continue.
- **End status.** Add your end status to `END_STATUSES`, which gives the Game Over controls, "▶ Next", and the party scoreboard.

### 5. Test it

- Add the game id to `GAME_LABELS` in `tests/regression/helpers.js`.
- Run `GAMES=<your-id> npm run test:regression -- games`.
- Then run a short playlist that includes it: `PLAYLIST=<your-id>,who-said-that npm run test:regression -- playlist`.
