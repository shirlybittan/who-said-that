import { gameAdapters } from '../adapters';

export function useHostGameFrame({ gameKey, state, socket, context = {} }) {
  const adapter = gameAdapters[gameKey];
  if (!adapter) throw new Error(`Missing host adapter for gameKey: ${gameKey}. Available adapters: ${Object.keys(gameAdapters).join(', ')}`);

  const frame = adapter.selectHostFrame(state, context);
  const actions = adapter.createHostActions({ socket, roomCode: frame.roomCode, state, context });
  
  console.log(`[Game-Core-Frame] Rendering frame for Host Game: ${gameKey}`, frame);

  return { frame, actions };
}
