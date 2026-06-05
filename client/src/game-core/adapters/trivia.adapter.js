import { createEmptyHostFrame, createEmptyPlayerFrame } from '../types/gameFrame.contract';

export const triviaAdapter = {
  selectHostFrame(state) {
    return createEmptyHostFrame({ state });
  },
  createHostActions() {
    return {
      togglePause: () => {},
      changeQuestion: () => {},
      skipQuestion: () => {},
      skipMiniGame: () => {},
    };
  },
  selectPlayerFrame() {
    return createEmptyPlayerFrame();
  },
  createPlayerActions() {
    return {
      submitChoice: () => {},
      toggleJoker: () => {},
    };
  },
};
