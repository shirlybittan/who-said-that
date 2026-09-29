// Which top-level room phase each server event implies.
//
// The client's `state.phase` must always match the server's `room.phase`,
// because usePhaseSync / App routing trust it. Historically each reducer set it
// (or forgot to): when a photo game skipped its photo step (everyone already had
// a saved selfie) the first event received was e.g. `caption:writing_phase`,
// whose reducer never set the phase, so every phone stayed in "lobby" while the
// game ran on the TV (AUDIT.md P0-04).
//
// This single declarative map is applied centrally in useSocket (socket.onAny),
// so a game can't get stuck by forgetting to set its phase.
export const EVENT_PHASE = {
  // Pre-game intro gate (every game)
  'game:intro': 'intro',
  'intro:cancelled': 'lobby',
  // Selfie Roast ("Draw on Friends")
  'selfie:photo_phase': 'selfie',
  'selfie:draw_assigned': 'selfie',
  'selfie:drawing_phase': 'selfie',
  'selfie:voting_started': 'selfie',
  // Caption
  'caption:photo_phase': 'caption',
  'caption:writing_phase': 'caption',
  'caption:voting_phase': 'caption',
  'caption:round_results': 'caption',
  'caption:game_over': 'captionEnd',
  // Photo Vote (Selfie Challenge / Prompt Match)
  'photovote:photo_phase': 'photovote',
  'photovote:voting_phase': 'photovote',
  'photovote:round_results': 'photovote',
  'photovote:game_over': 'photovoteEnd',
  // Other games
  'mlt:prompt': 'mlt',
  'mlt:end': 'mltEnd',
  'tot:end': 'totEnd',
  'draw:round_start': 'drawing',
  'draw:end': 'drawEnd',
  'fitb:round_start': 'fitb',
  'fitb:end': 'fitbEnd',
  'dt:selfie_phase': 'dt',
  'dt:prompt_phase': 'dt',
  'dt:drawing_phase': 'dt',
  'dt:guessing_phase': 'dt',
  'dt:reveal_phase': 'dt',
  'dt:end': 'dtEnd',
};

/** Returns the phase implied by an event, or null when the event doesn't imply one. */
export const phaseForEvent = (event) => EVENT_PHASE[event] || null;
