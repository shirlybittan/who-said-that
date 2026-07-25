// Server-authoritative "what screen should this player be on right now?"
//
// The server holds the full per-player truth — whose turn it is in a chain, who
// has submitted, the exact sub-phase — that the client's coarse route mapping
// can't safely reproduce. Exposing this lets a client periodically ask the
// server to confirm its screen and self-correct if a navigation was ever missed
// (the "recovery-first" model). Pure function → unit-testable.
//
// Returns a route string, or null when there is no room/player (caller leaves
// the client where it is).

const computeCanonicalRoute = (room, playerId) => {
  if (!room) return null;
  const player = (room.players || []).find((p) => p.id === playerId);
  if (!player) return null;

  // A brand-new player who joined mid-round waits in the lobby until the next
  // round folds them in (server clears joinedMidRound at that point).
  if (player.joinedMidRound && room.phase && room.phase !== 'lobby') return '/lobby';

  switch (room.phase) {
    case 'question':
      return '/question';
    case 'sit-voting':
    case 'sit-results':
      return '/sit-vote';
    case 'voting':
      return '/vote';
    case 'roundEnd':
      return '/round-end';
    case 'gameEnd':
      return '/game-end';
    case 'mlt':
      return room.mlt?.roundState === 'results' ? '/mlt-results' : '/mlt-vote';
    case 'mltEnd':
      return '/mlt-end';
    case 'tot':
      return '/tot';
    case 'totEnd':
      return '/tot-end';
    case 'drawing':
      return '/draw';
    case 'drawEnd':
      return '/draw-end';
    case 'fitb':
      return '/fitb';
    case 'fitbEnd':
      return '/fitb-end';
    case 'selfie': {
      const p = room.selfie?.phase;
      if (p === 'voting') return '/selfie-vote';
      if (p === 'results') return '/selfie-results';
      if (p === 'drawing') return '/selfie-draw';
      return '/selfie-photo';
    }
    case 'selfieEnd':
      return '/selfie-results';
    case 'caption': {
      const p = room.caption?.phase;
      if (p === 'photo') return '/caption-photo';
      if (p === 'writing') return '/caption-write';
      if (p === 'voting') return '/caption-vote';
      return '/caption-results';
    }
    case 'photovote': {
      const p = room.photoVote?.phase;
      if (p === 'photo') return '/photo-vote-photo';
      if (p === 'voting') return '/photo-vote';
      return '/photo-vote-results';
    }
    case 'dt':
      return computeDtRoute(room, playerId);
    case 'dtEnd':
      return '/draw-tel-end';
    default:
      return '/lobby';
  }
};

// Draw Telephone is the one game where the correct screen is truly per-player:
// only the player whose turn it is should be on the draw/guess screen; everyone
// else waits. This mirrors the per-player derivation in buildDtSnapshot.
const computeDtRoute = (room, playerId) => {
  const dt = room.dt || {};
  switch (dt.phase) {
    case 'selfie':
      return '/selfie-photo';
    case 'prompting':
      return '/draw-tel-prompt';
    case 'drawing': {
      const promptId = dt.activeTurns?.[playerId] || null;
      return promptId && dt.chains?.[promptId] ? '/draw-tel-draw' : '/draw-tel-wait';
    }
    case 'guessing': {
      const guessEntry = Object.entries(dt.chains || {}).find(([, chain]) => chain.targetPlayerId === playerId);
      const guessPromptId = guessEntry?.[0] || null;
      const alreadyGuessed = guessPromptId && dt.guesses?.[guessPromptId] !== undefined;
      return guessPromptId && !alreadyGuessed ? '/draw-tel-guess' : '/draw-tel-wait';
    }
    case 'reveal':
      return '/draw-tel-reveal';
    case 'end':
      return '/draw-tel-end';
    default:
      return '/draw-tel-wait';
  }
};

module.exports = { computeCanonicalRoute };
