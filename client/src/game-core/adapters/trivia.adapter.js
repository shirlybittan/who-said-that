import { createEmptyHostFrame, createEmptyPlayerFrame } from '../types/gameFrame.contract';

export const triviaAdapter = {
  selectHostFrame() {
    return createEmptyHostFrame();
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
