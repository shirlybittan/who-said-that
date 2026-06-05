import { mostLikelyToAdapter } from './mostLikelyTo.adapter';
import { triviaAdapter } from './trivia.adapter';
import { drawingAdapter } from './drawing.adapter';
import { thisOrThatAdapter } from './thisOrThat.adapter';

export const gameAdapters = {
  'most-likely-to': mostLikelyToAdapter,
  trivia: triviaAdapter,
  drawing: drawingAdapter,
  'this-or-that': thisOrThatAdapter,
};
