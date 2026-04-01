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
