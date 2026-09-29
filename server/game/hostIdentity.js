// Who is the host, and how the role survives disconnects.
//
// Model (AUDIT.md P1-11/12/13, P2-31/32, product decision Q4):
//   - The room creator is the OWNER (room.ownerId). A room can be created from
//     the TV (/host, owner = a non-playing "display" player) or from a phone
//     ("Host on this phone", owner plays and hosts from the phone).
//   - Creating a room issues a secret room.hostKey, sent only to the creator.
//     A TV that presents it (reconnect, or the phone host's "Show on TV" link)
//     is bound to the owner and gets host controls. Anyone else who opens
//     /host?room=CODE is a view-only display.
//   - Host identity is the player record, not a socket: the TV screen is kept
//     in tvSocketId, the controller (phone or TV-owner) in socketId.
//   - When the host goes offline the role is NOT moved immediately: after a
//     grace period the first connected player becomes host so the game can
//     continue without a TV. When the owner comes back they get it back.
//   - If nobody is host (e.g. everyone dropped), the next player to (re)join
//     becomes host — a room can never be left permanently hostless.

const { randomUUID } = require('crypto');

const HOST_GRACE_MS = 45 * 1000;

const findById = (room, id) => (room.players || []).find(p => p.id === id) || null;
const currentHost = (room) => (room.players || []).find(p => p.isHost) || null;

function issueHostKey(room, ownerId) {
  room.hostKey = randomUUID();
  room.ownerId = ownerId;
  return room.hostKey;
}

function setHost(room, player) {
  (room.players || []).forEach(p => { p.isHost = false; });
  if (player) {
    player.isHost = true;
    room.host = player.id;
  }
  room.hostOfflineSince = null;
  return player;
}

/**
 * A /host screen joined. With the right key it becomes the owner's TV (and the
 * owner is host again); otherwise it's a view-only display.
 * @returns {{ canControl: boolean, hostChanged: boolean }}
 */
function bindDisplay(room, socketId, hostKey) {
  if (!hostKey || !room.hostKey || hostKey !== room.hostKey) return { canControl: false, hostChanged: false };
  const owner = findById(room, room.ownerId);
  if (!owner) return { canControl: false, hostChanged: false };
  if (owner.isDisplay) owner.socketId = socketId;   // TV-created room: the TV IS the owner's controller
  else owner.tvSocketId = socketId;                 // phone host casting to a TV
  owner.isConnected = true;
  const hostChanged = !owner.isHost;
  if (hostChanged) setHost(room, owner);
  else room.hostOfflineSince = null;
  return { canControl: true, hostChanged };
}

/** Record that the host went offline (starts the grace period). */
function noteHostOffline(room, now = Date.now()) {
  const host = currentHost(room);
  if (host && !host.isConnected && !room.hostOfflineSince) room.hostOfflineSince = now;
}

/**
 * Make sure a connected player holds the host role when it matters:
 *   - the owner is connected but not host → owner gets it back;
 *   - the host is offline past the grace period (or nobody is host) → the first
 *     connected playing player (else any connected player) becomes host.
 * @returns {object|null} the new host when the role moved, else null
 */
function resolveHost(room, now = Date.now()) {
  const host = currentHost(room);
  const owner = findById(room, room.ownerId);
  if (owner && owner.isConnected && !owner.isHost) return setHost(room, owner);
  if (host && host.isConnected) return null;
  if (host && room.hostOfflineSince && now - room.hostOfflineSince < HOST_GRACE_MS) return null;
  const connected = (room.players || []).filter(p => p.isConnected);
  const next = connected.find(p => p.isPlaying && !p.isDisplay) || connected[0] || null;
  if (!next || next === host) return null;
  return setHost(room, next);
}

/** Room object safe to send to clients: never leaks the host key. */
function withoutSecrets(room) {
  if (!room || typeof room !== 'object') return room;
  // eslint-disable-next-line no-unused-vars
  const { hostKey, ...rest } = room;
  return rest;
}

module.exports = { HOST_GRACE_MS, issueHostKey, bindDisplay, noteHostOffline, resolveHost, setHost, withoutSecrets };
