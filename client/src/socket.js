import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Inject the persisted session credentials into every handshake so the server
 * can remap a reconnecting socket to the correct player without waiting for a
 * separate join_room event.
 */
const getAuthCredentials = () => ({
  playerId: localStorage.getItem('wst_playerId') || null,
  roomCode: localStorage.getItem('wst_roomCode') || null,
  playerName: localStorage.getItem('wst_playerName') || null,
});

export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  auth: getAuthCredentials,   // Socket.io calls this fn on every (re)connect
});
