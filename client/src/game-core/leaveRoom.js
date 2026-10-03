import { socket } from '../socket';

/**
 * Leave the current room for real: drop the socket (the server marks the
 * player offline and re-checks round thresholds), forget the session and go
 * home. "Main Menu" used to only navigate('/'), leaving the phone connected
 * and still counted as an active player.
 */
export function leaveRoom(dispatch, navigate) {
  try { socket.disconnect(); } catch { /* ignore */ }
  dispatch({ type: 'CLEAR_SESSION' });
  dispatch({ type: 'RESET_GAME' });
  navigate('/');
}
