import { mostLikelyToAdapter } from './mostLikelyTo.adapter';
import { triviaAdapter } from './trivia.adapter';
import { thisOrThatAdapter } from './thisOrThat.adapter';

export const gameAdapters = {
  'most-likely-to': mostLikelyToAdapter,
  trivia: triviaAdapter,
  'this-or-that': thisOrThatAdapter,
};
