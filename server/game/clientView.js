// What a phone may see of the room (AUDIT.md P2-36).
//
// join_success (every rejoin / resync) used to send the whole room. During a
// Who Said That? round that includes who wrote every answer — the very thing
// the players are trying to guess — and the base64 photo bank of every player.
// roomForPlayer() keeps everything the phone restores from, minus those.

const ANSWER_PHASES = new Set(['question', 'voting']);

/**
 * @param {object} room      room already stripped of timers and secrets
 * @param {string} playerId  the phone the snapshot is for
 */
function roomForPlayer(room, playerId) {
  if (!room || typeof room !== 'object') return room;
  // eslint-disable-next-line no-unused-vars
  const { playerPhotos, ...view } = room;

  if (ANSWER_PHASES.has(room.phase) && Array.isArray(room.answers)) {
    view.answers = room.answers.map((a) => {
      if (a.playerId === playerId) return a;
      // Answering: who has answered is public (the TV ticks names), the text is not.
      // Voting: the texts are on screen, their authors are the secret.
      return room.phase === 'question' ? { playerId: a.playerId } : { text: a.text };
    });
  }
  return view;
}

module.exports = { roomForPlayer };
