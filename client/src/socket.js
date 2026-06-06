import { io } from 'socket.io-client';

const URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

/**
 * Inject the persisted session credentials into every handshake so the server
 * can remap a reconnecting socket to the correct player without waiting for a
 * separate join_room event.
 *
 * NOTE: socket.io-client v4 requires auth to be EITHER a plain object OR a
 * function that accepts a callback: (cb) => cb(data).  A plain function that
 * just *returns* an object is silently ignored — the callback is never called
 * and the namespace CONNECT packet is never sent, so nothing works.
 */
const getAuthCredentials = (cb) => {
  cb({
    playerId: localStorage.getItem('wst_playerId') || null,
    roomCode: localStorage.getItem('wst_roomCode') || null,
    playerName: localStorage.getItem('wst_playerName') || null,
  });
};

export const socket = io(URL, {
  autoConnect: false,
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  auth: getAuthCredentials,   // called on every (re)connect with current localStorage
});
