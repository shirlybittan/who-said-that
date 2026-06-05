import { gameAdapters } from '../adapters';

export function usePlayerGameFrame({ gameKey, state, socket, dispatch, context = {} }) {
  const adapter = gameAdapters[gameKey];
  if (!adapter) throw new Error(`Missing player adapter for gameKey: ${gameKey}`);

  const frame = adapter.selectPlayerFrame(state, context);
  const actions = adapter.createPlayerActions({ socket, roomCode: state?.roomCode, dispatch, state, context });

  return { frame, actions };
}
