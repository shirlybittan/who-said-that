import { gameAdapters } from '../adapters';

export function usePlayerGameFrame({ gameKey, state, socket, dispatch, context = {} }) {
  const adapter = gameAdapters[gameKey];
  if (!adapter) throw new Error(`Missing player adapter for gameKey: ${gameKey}. Available adapters: ${Object.keys(gameAdapters).join(', ')}`);

  const roomCode = state?.gameInfo?.code || state?.roomCode;
  const frame = adapter.selectPlayerFrame(state, context);
  const actions = adapter.createPlayerActions({ socket, roomCode, dispatch, state, context });
  
  console.log(`[Game-Core-Frame] Rendering frame for Player Game: ${gameKey}`, frame);

  return { frame, actions };
}
