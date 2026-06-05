import { gameAdapters } from '../adapters';

export function useHostGameFrame({ gameKey, state, socket, context = {} }) {
  const adapter = gameAdapters[gameKey];
  if (!adapter) throw new Error(`Missing host adapter for gameKey: ${gameKey}`);

  const frame = adapter.selectHostFrame(state, context);
  const actions = adapter.createHostActions({ socket, roomCode: frame.roomCode, state, context });

  return { frame, actions };
}
