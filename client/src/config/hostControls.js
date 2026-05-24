/**
 * Declarative host-controls configuration map.
 *
 * buildHostControls(ctx) returns an object keyed by game status whose value
 * is an array of button descriptor objects:
 *
 *   { label, onClick, primary?, disabled?, color?, hoverColor? }
 *
 * `primary`    – when true, renders as a filled "call to action" button
 * `disabled`   – when true, button is non-interactive
 * `color`      – override accent colour for the button border/text
 * `hoverColor` – colour on hover (defaults to color)
 *
 * ─── Usage ─────────────────────────────────────────────────────────────────
 *
 *   import { buildHostControls } from '../config/hostControls';
 *
 *   const config = buildHostControls({ handlers, status, ... });
 *   const buttons = config[status] ?? [];
 */

export const QUEUE_GAME_LABELS = {
  'most-likely-to': 'Most Likely To',
  'whos-most-likely': 'Most Likely To',
  'this-or-that': 'This or That',
  situational: 'Situational',
  drawing: 'Sketch It',
  mixed: 'Mixed',
  'fill-in-the-blank': 'Fill in the Blank',
  caption: 'Selfie Captions',
  'photo-vote': 'Photo Vote',
  selfie: 'Selfie Roast',
  'selfie-roast': 'Draw on Friends',
  photoassoc: 'Prompt Match',
  pmatch: 'Selfie Challenge',
};

/**
 * @param {object} ctx
 * @param {number}   ctx.playingCount
 * @param {object}   ctx.mlt            – mlt state slice
 * @param {object}   ctx.votingData
 * @param {object}   ctx.fitbData
 * @param {Array}    ctx.gameQueue
 * @param {number}   ctx.queueIndex
 * @param {object}   ctx.handlers       – all handler functions (see below)
 * @returns {Record<string, Array>}
 */
export function buildHostControls({
  playingCount = 0,
  mlt = {},
  votingData = {},
  fitbData = {},
  gameQueue = [],
  queueIndex = 0,
  handlers = {},
}) {
  const {
    onStart,
    onMltPauseResume,
    onMltChangeQuestion,
    onMltNext,
    onNextRound,
    onSkipQuestion,
    onSkipMiniGame,
    onTotNext,
    onSitNext,
    onNextAnswer,
    onDrawShowResults,
    onDrawNextRound,
    onDrawNewWord,
    onFitbChangeQuestion,
    onFitbSkipToVote,
    onFitbShowResults,
    onFitbNextRound,
    onSelfieSkipQuestion,
    onShowSelfieResults,
    onSelfieNextRound,
    onPlayAgain,
    onNextQueueGame,
    onNewPartyPack,
  } = handlers;

  const canStart = playingCount >= 3;
  const skipBtn = {
    label: '🔀 Skip Mini Game',
    onClick: onSkipMiniGame,
    color: '#FF8B94',
  };

  const hasNextInQueue = gameQueue.length > 1 && queueIndex < gameQueue.length - 1;
  const nextGame = hasNextInQueue ? gameQueue[queueIndex + 1] : null;

  const fitbPhase = fitbData?.phase;

  return {
    lobby: [
      {
        label: canStart
          ? '▶ Start Game'
          : `⏳ Need ${3 - playingCount} more player${3 - playingCount !== 1 ? 's' : ''}`,
        onClick: onStart,
        primary: true,
        disabled: !canStart,
        color: '#4ECDC4',
      },
    ],

    'mlt-voting': [
      { label: mlt.paused ? '▶ Resume' : '⏸ Pause', onClick: onMltPauseResume, color: '#FFE66D' },
      { label: '🔄 Change Question', onClick: onMltChangeQuestion },
      skipBtn,
    ],

    'mlt-results': [
      { label: 'Next Round →', onClick: onMltNext, primary: true, color: '#4ECDC4' },
      skipBtn,
    ],

    question: [
      { label: '⏭ Skip Question', onClick: onSkipQuestion, color: '#FFE66D' },
      skipBtn,
    ],

    'sit-voting': [
      { label: '⏭ Skip Question', onClick: onSkipQuestion, color: '#FFE66D' },
      skipBtn,
    ],

    'round-end': [
      { label: 'Next Round →', onClick: onNextRound, primary: true, color: '#4ECDC4' },
      skipBtn,
    ],

    tot: [
      { label: '⏭ Skip / Next →', onClick: onTotNext, color: '#6C5CE7' },
      skipBtn,
    ],

    'sit-results': [
      { label: 'Next Round →', onClick: onSitNext, primary: true, color: '#A8E6CF' },
      skipBtn,
    ],

    voting: [
      { label: '⏭ Skip Question', onClick: onSkipQuestion, color: '#FFE66D' },
      {
        label: votingData?.allVotesIn ? 'Next Answer →' : '⏳ Waiting for votes...',
        onClick: onNextAnswer,
        primary: true,
        disabled: !votingData?.allVotesIn,
        color: '#6C5CE7',
      },
      skipBtn,
    ],

    drawing: [
      { label: '🔄 New Word', onClick: onDrawNewWord, color: '#FFE66D' },
      skipBtn,
    ],

    'draw-voting': [
      { label: '🏆 Show Results', onClick: onDrawShowResults, color: '#C39BD3' },
      skipBtn,
    ],

    'draw-results': [
      { label: 'Next Round →', onClick: onDrawNextRound, primary: true, color: '#C39BD3' },
      skipBtn,
    ],

    // fitb sub-phases embedded under the 'fitb' key (special handling in component)
    'fitb-answering': [
      { label: '🔄 Change Question', onClick: onFitbChangeQuestion, color: '#F9CA24' },
      { label: '⏭ Skip to Vote', onClick: onFitbSkipToVote, color: '#FFE66D' },
      skipBtn,
    ],

    'fitb-voting': [
      { label: '🏆 Show Results', onClick: onFitbShowResults, color: '#F9CA24' },
      skipBtn,
    ],

    'fitb-results': [
      { label: 'Next Round →', onClick: onFitbNextRound, primary: true, color: '#F9CA24' },
      skipBtn,
    ],

    caption: [skipBtn],
    photovote: [skipBtn],

    selfie: [
      { label: '🔄 Change Question', onClick: onSelfieSkipQuestion, color: '#FD79A8' },
      skipBtn,
    ],

    'selfie-vote': [
      { label: '🏆 Show Results', onClick: onShowSelfieResults, color: '#FD79A8' },
      skipBtn,
    ],

    'selfie-round-results': [
      { label: 'Next Round →', onClick: onSelfieNextRound, primary: true, color: '#FD79A8' },
      skipBtn,
    ],

    // game-end and all end variants
    'game-end': buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }),
    'mlt-end': buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }),
    'tot-end': buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }),
    'draw-end': buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }),
    'fitb-end': buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }),
    'selfie-results': buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }),
  };
}

function buildEndButtons({ onPlayAgain, onNextQueueGame, onNewPartyPack, hasNextInQueue, nextGame }) {
  const btns = [
    { label: '🔄 Play Again', onClick: onPlayAgain, color: '#4ECDC4' },
  ];
  if (hasNextInQueue && nextGame) {
    btns.push({
      label: `▶ Next: ${QUEUE_GAME_LABELS[nextGame.type] || nextGame.type}`,
      onClick: onNextQueueGame,
      primary: true,
      color: '#6C5CE7',
    });
  }
  btns.push({
    label: '🎮 New Party Pack',
    onClick: onNewPartyPack,
    primary: true,
    color: '#FFE66D',
    textColor: 'black',
  });
  return btns;
}
