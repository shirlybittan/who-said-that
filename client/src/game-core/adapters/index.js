import { mostLikelyToAdapter } from './mostLikelyTo.adapter';
import { triviaAdapter } from './trivia.adapter';
import { drawingAdapter } from './drawing.adapter';

export const gameAdapters = {
  'most-likely-to': mostLikelyToAdapter,
  trivia: triviaAdapter,
  drawing: drawingAdapter,
};
