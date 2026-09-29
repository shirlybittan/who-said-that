// Socket hardening: no client message may crash the process.
//
// socket.io v4 runs listeners inside process.nextTick, so an exception thrown by
// any handler (e.g. destructuring a missing payload) is an uncaught exception
// that kills the server for every room. hardenSocket():
//   1. normalizes payloads — a missing / null / non-object first argument
//      becomes {} (an ack callback in first position is preserved), so every
//      `({ code, text }) =>` handler receives an object;
//   2. wraps every handler registered via socket.on (including ones added later
//      by game modules) in a try/catch that logs instead of throwing.

const isPlainPayload = (v) => v !== null && typeof v === 'object';

function normalizePacket(packet) {
  // packet = [event, ...args]
  const first = packet[1];
  if (typeof first === 'function') packet.splice(1, 0, {});
  else if (!isPlainPayload(first)) packet[1] = {};
  return packet;
}

function hardenSocket(socket, log) {
  socket.use((packet, next) => {
    normalizePacket(packet);
    next();
  });

  const originalOn = socket.on.bind(socket);
  socket.on = (event, handler) => originalOn(event, (...args) => {
    try {
      const result = handler(...args);
      if (result && typeof result.catch === 'function') {
        result.catch(err => log.error('socket handler rejected', { event, socketId: socket.id, err: err?.stack || String(err) }));
      }
      return result;
    } catch (err) {
      log.error('socket handler threw', { event, socketId: socket.id, err: err?.stack || String(err) });
      return undefined;
    }
  });
  return socket;
}

module.exports = { hardenSocket, normalizePacket };
