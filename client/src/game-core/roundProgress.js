// "Who has / hasn't answered yet" for every game (AUDIT.md §6.1 "Waiting").
//
// Every server "X received" event already carries the ids of the players who
// are done (answeredPlayerIds, votedPlayerIds, submittedPlayerIds, …). They all
// feed ONE `roundProgress` slice through useSocket's onAny hook, and the shared
// waiting components (MiniGameWrapper, VoteLocked) render <WaitingFor/> from it,
// so every game shows who is still missing by default.

const DONE_IDS_KEY = /PlayerIds$/;

// Events that start a new thing to wait for → progress resets.
const RESET_EVENT = /(_phase|voting_started|round_start|new_question|next_answer|:prompt$|:results$|round_results|round_ended|game_changed|:draw_assigned|:your_turn|:your_guess)/;

export const initialRoundProgress = { doneIds: [], source: null };

/** Store action for an incoming socket event, or null. */
export function progressActionFor(event, data) {
  if (RESET_EVENT.test(event)) return { type: 'ROUND_PROGRESS_RESET' };
  if (data && typeof data === 'object') {
    const key = Object.keys(data).find(k => DONE_IDS_KEY.test(k) && Array.isArray(data[k]));
    if (key) return { type: 'ROUND_PROGRESS', payload: { doneIds: data[key], source: event } };
  }
  return null;
}

export function roundProgressReducer(progress = initialRoundProgress, action) {
  switch (action.type) {
    case 'ROUND_PROGRESS':
      return { doneIds: [...new Set(action.payload.doneIds)], source: action.payload.source };
    case 'ROUND_PROGRESS_RESET':
      return initialRoundProgress;
    default:
      return progress;
  }
}

/** Players expected this round who haven't submitted yet. */
export function pendingPlayers(players, doneIds, { excludeId } = {}) {
  const done = new Set(doneIds || []);
  return (players || []).filter(p => p.isPlaying && p.isConnected && !p.joinedMidRound && !done.has(p.id) && p.id !== excludeId);
}
