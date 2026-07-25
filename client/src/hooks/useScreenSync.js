import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import { useGame } from '../store/gameStore.jsx';

/**
 * Recovery-first screen synchronizer. While in an active game, periodically (and
 * on tab wake) asks the SERVER — the authority on per-player state — which screen
 * this player should be on. If the answer differs from the current route, it
 * navigates there and pulls a fresh state snapshot for that screen.
 *
 * This complements the instant, client-side top-level backstop in usePhaseSync:
 * that one reacts immediately to coarse phase mismatches; this one catches the
 * precise per-player sub-phase strands (e.g. Draw Telephone turn/wait) that only
 * the server can resolve correctly. Together, a missed navigation self-heals
 * within a couple of seconds without a room restart.
 *
 * It only ever acts on a genuine mismatch, so steady-state play is untouched.
 */
const POLL_MS = 7000;
const INITIAL_CHECK_MS = 1500;

export const useScreenSync = () => {
  const { state } = useGame();
  const navigate = useNavigate();
  const location = useLocation();

  const { roomCode, phase } = state;

  // Latest pathname without retriggering the effect on every navigation.
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;

  useEffect(() => {
    if (!roomCode || !phase || phase === 'home') return;
    if (pathRef.current === '/' || pathRef.current === '/host') return;

    let cancelled = false;

    const check = () => {
      if (cancelled || !socket.connected) return;
      socket.emit('whats_my_screen', { code: roomCode }, (serverRoute) => {
        if (cancelled || !serverRoute) return;
        const path = pathRef.current;
        if (path === '/' || path === '/host') return;
        if (serverRoute !== path) {
          // We were on the wrong screen — correct it and resync the state that
          // screen needs (the missed event may have carried state too).
          navigate(serverRoute, { replace: true });
          socket.emit('request_resync', { code: roomCode });
        }
      });
    };

    const initial = setTimeout(check, INITIAL_CHECK_MS);
    const interval = setInterval(check, POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [roomCode, phase, navigate]);
};
