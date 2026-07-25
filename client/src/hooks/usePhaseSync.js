import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGame } from '../store/gameStore.jsx';
import { getRouteForPhase } from '../utils/rejoinState.js';

// Every route that is legitimately part of a given top-level server phase. The
// reconciler treats any of these as "correct" for that phase so it never fights
// a page's own sub-phase navigation (e.g. mlt vote → results). It only steps in
// when the current screen belongs to a DIFFERENT phase entirely — i.e. the
// player got stranded because a `navigate()` event was missed or arrived during
// an unmount. Keep this in sync with getRouteForPhase().
const PHASE_ROUTES = {
  lobby: ['/lobby'],
  question: ['/question'],
  'sit-voting': ['/sit-vote'],
  'sit-results': ['/sit-vote'],
  voting: ['/vote'],
  roundEnd: ['/round-end'],
  gameEnd: ['/game-end'],
  mlt: ['/mlt-vote', '/mlt-results'],
  mltEnd: ['/mlt-end'],
  tot: ['/tot'],
  totEnd: ['/tot-end'],
  drawing: ['/draw'],
  drawEnd: ['/draw-end'],
  fitb: ['/fitb'],
  fitbEnd: ['/fitb-end'],
  selfie: ['/selfie-photo', '/selfie-draw', '/selfie-vote', '/selfie-results'],
  selfieEnd: ['/selfie-results'],
  caption: ['/caption-photo', '/caption-write', '/caption-vote', '/caption-results'],
  photovote: ['/photo-vote-photo', '/photo-vote', '/photo-vote-results'],
  dt: ['/draw-tel-prompt', '/draw-tel-draw', '/draw-tel-guess', '/draw-tel-reveal', '/draw-tel-end', '/draw-tel-wait', '/selfie-photo'],
  dtEnd: ['/draw-tel-end'],
};

// Build the sub-phase "snapshot" getRouteForPhase expects from live store state,
// so the computed target route matches what the player should actually see.
const liveSnapshotFor = (state) => {
  switch (state.phase) {
    case 'mlt': return { roundState: state.mlt?.roundState };
    case 'selfie': return { phase: state.selfie?.phase };
    case 'caption': return { phase: state.caption?.phase };
    case 'photovote': return { phase: state.photoVote?.phase };
    case 'dt': return { phase: state.dt?.phase, currentTurn: state.dt?.currentTurn, guessTurn: state.dt?.guessTurn };
    default: return null;
  }
};

/**
 * Pure reconciliation decision — extracted so it can be unit-tested exhaustively.
 * Returns the route to navigate to, or null to stay put. Returns null whenever
 * the current path is already a valid screen for the phase (so it never fights
 * sub-phase navigation), when not in a game, or when intentionally parked in the
 * lobby mid-round.
 */
export const computeReconcileTarget = (state, path) => {
  const { phase, roomCode, joinedMidRound } = state;
  if (!roomCode || !phase || phase === 'home') return null;
  if (path === '/' || path === '/host') return null;
  if (joinedMidRound) return null;

  const valid = PHASE_ROUTES[phase];
  if (!valid) return null;
  if (valid.includes(path)) return null;

  const target = getRouteForPhase(phase, liveSnapshotFor(state));
  return target && target !== path ? target : null;
};

/**
 * Self-healing screen synchronizer. Continuously checks whether the player's
 * current URL still belongs to the authoritative server phase; if it doesn't,
 * it navigates them to the correct screen. This is the safety net that makes a
 * dropped/duplicated/late `navigate()` recoverable instead of stranding a
 * player on the previous round or in the lobby.
 *
 * Deliberately a BACKSTOP, not a replacement for the pages' own navigation:
 * while the URL is any valid route for the current phase it does nothing, so it
 * can't fight in-game sub-phase transitions or oscillate. Because the route it
 * picks is always itself valid for the phase, it corrects in a single hop.
 */
export const usePhaseSync = () => {
  const { state } = useGame();
  const navigate = useNavigate();
  const location = useLocation();

  const { phase, roomCode, joinedMidRound } = state;
  const path = location.pathname;

  // Sub-phase fields that can change the correct route within a phase — depended
  // on so the check re-runs when they move.
  const mltRoundState = state.mlt?.roundState;
  const selfiePhase = state.selfie?.phase;
  const captionPhase = state.caption?.phase;
  const photoVotePhase = state.photoVote?.phase;
  const dtPhase = state.dt?.phase;
  const dtHasTurn = !!state.dt?.currentTurn;
  const dtHasGuess = !!state.dt?.guessTurn;

  useEffect(() => {
    if (!roomCode || !phase || phase === 'home') return;   // not in an active game
    if (path === '/' || path === '/host') return;          // home / TV screen opt out
    if (joinedMidRound) return;                            // intentionally parked in lobby until next round

    const target = computeReconcileTarget(state, path);
    if (target) navigate(target, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, roomCode, joinedMidRound, path, navigate,
      mltRoundState, selfiePhase, captionPhase, photoVotePhase, dtPhase, dtHasTurn, dtHasGuess]);
};
