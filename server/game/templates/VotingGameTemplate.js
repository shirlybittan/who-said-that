/**
 * VotingGameTemplate — reusable server-side game flow for prompt → voting → results games.
 *
 * Standard flow: round_start → [answering phase optional] → voting → results → next round → end
 *
 * Handles:
 *   - Round lifecycle via RoundManager
 *   - Phase tracking via PhaseManager
 *   - Vote deduplication and threshold detection via VoteCollector
 *   - Countdown timer via TimerManager
 *   - Score accumulation via ScoreCalculator
 *   - Standard socket event naming via EVENTS registry
 *
 * Games that use this template:
 *   Most Likely To (mlt) — via createVotingGame()
 *   This or That (tot)   — has team-split voting; uses helpers but not this template
 *   Situational (sit)    — uses advanceWstAnswerPhase; candidate for future migration
 *
 * Usage:
 *   const mltGame = createVotingGame({ gameKey: 'mlt', ... });
 *   mltGame.start(io, room, code, { rounds: 5 });
 *   mltGame.startVoting(io, room, code);
 *   mltGame.showResults(io, room, code);
 *
 * Callers that need custom scoring or multi-player mechanics (e.g. MLT jokers)
 * should override onResults or call showResults with a custom scorer via config.
 */

const TimerManager   = require('../TimerManager');
const VoteCollector  = require('../VoteCollector');
const { calculateVotingScores, buildLeaderboard, mergeRoundScores } = require('../ScoreCalculator');
const { createPhaseManager } = require('../PhaseManager');
const { createRoundManager } = require('../RoundManager');
const { EVENTS }     = require('../events');

/**
 * Factory that produces a game controller object with start / startVoting / showResults methods.
 *
 * This template standardizes the flow:
 * 1. Initialize room state via `start(...)`.
 * 2. Start rounds using `RoundManager` & `PhaseManager` which update `room[gameKey]`.
 * 3. Receive votes through standard socket events, validated and counted by `VoteCollector`.
 * 4. Advance to results automatically (upon all votes received or timer expiration).
 * 5. Calculate scores and leaderboards via `ScoreCalculator`.
 *
 * @param {object}   opts
 * @param {string}   opts.gameKey        - Namespace key used in room state and socket events (e.g. 'mlt')
 * @param {string[]} [opts.phases]       - Ordered phase list; defaults to ['voting', 'results']
 * @param {number}   opts.votingSeconds  - Voting countdown duration in seconds
 * @param {Function} opts.getPrompt      - (room, round) => string|object Returns prompt for each round
 * @param {object}   [opts.scoreConfig]  - Passed to calculateVotingScores ({ pointsPerVote, allowSelfVote })
 * @param {Function} [opts.onRoundStart] - (io, room, code, round) => void Custom round-start side-effects (e.g. emitting prompts to clients)
 * @param {Function} [opts.onResults]    - (io, room, code, resultsPayload) => void Override default results emit (e.g. customized scoring/majority mechanics)
 * @param {Function} [opts.onEnd]        - (io, room, code, leaderboard) => void Override default end emit (e.g. custom titles like "🔮 Top Predictor")
 * @param {Function} [opts.getActivePlayers] - (room) => Player[] Defaults to connected + playing players
 *
 * @returns {{ start: Function, startVoting: Function, showResults: Function, nextRound: Function, skipRound: Function }}
 *
 * @example
 * // How to initialize a custom voting game:
 * const mltGame = createVotingGame({
 *   gameKey: 'mlt',
 *   votingSeconds: 30,
 *   scoreConfig: { allowSelfVote: true },
 *   getPrompt: (room, round) => room.questions[round - 1],
 *   onRoundStart: (io, room, code, round) => {
 *     io.to(code).emit('mlt:new_round_prompt', { prompt: room.mlt.prompt });
 *   },
 *   onResults: (io, room, code, results) => {
 *     // custom majority calculation...
 *     io.to(code).emit('mlt:results', results);
 *   },
 *   onEnd: (io, room, code, leaderboard) => {
 *     io.to(code).emit('mlt:ended', { leaderboard, titles: computeMltTitles(room) });
 *   }
 * });
 *
 * // Initial room state shape created in room[gameKey]:
 * // {
 * //   phase: 'waiting' | 'voting' | 'results' | 'ended',
 * //   round: number,
 * //   totalRounds: number,
 * //   prompt: string | object | null,
 * //   votes: Record<string, string>, // voterPlayerId -> votedPlayerId
 * //   scores: Record<string, number>, // playerId -> totalScore
 * //   secondsLeft: number,
 * //   paused: boolean
 * // }
 */
function createVotingGame({
  gameKey,
  phases = ['voting', 'results'],
  votingSeconds,
  getPrompt,
  scoreConfig = {},
  onRoundStart,
  onResults,
  onEnd,
  getActivePlayers,
}) {
  if (!gameKey) throw new Error('createVotingGame: gameKey is required');
  if (!votingSeconds) throw new Error('createVotingGame: votingSeconds is required');
  if (!getPrompt) throw new Error('createVotingGame: getPrompt is required');

  const activePlayers = getActivePlayers
    || ((room) => room.players.filter(p => p.isConnected && p.isPlaying));

  const game = {
    /**
     * Initialise room state and kick off round 1.
     *
     * @param {object} io
     * @param {object} room
     * @param {string} code
     * @param {object} [config]          - { rounds: number, ...gameSpecificState }
     */
    start(io, room, code, config = {}) {
      const parsedRounds = parseInt(config.rounds);
      const totalRounds = Math.max(isNaN(parsedRounds) ? 5 : parsedRounds, 1);

      // Initialise game namespace on room
      room[gameKey] = {
        phase: 'waiting',
        round: 0,
        totalRounds,
        prompt: null,
        votes: {},
        scores: {},
        secondsLeft: votingSeconds,
        paused: false,
        ...config._initialState,
      };

      room._timers = room._timers || {};

      const phaseManager = createPhaseManager({
        phases,
        onPhaseChange: (prev, next) => {
          room[gameKey].phase = next;
        },
      });

      const roundManager = createRoundManager({
        totalRounds,
        onRoundStart: (round) => {
          room[gameKey].round = round;
          room[gameKey].prompt = getPrompt(room, round);
          room[gameKey].votes = {};
          room[gameKey].paused = false;
          // Directly set phase — phaseManager.goTo skips the callback when already at index 0
          phaseManager.reset();
          room[gameKey].phase = phases[0];

          // Reset VoteCollector for the new round
          if (room[gameKey]._voteCollector) {
            room[gameKey]._voteCollector.reset();
          }
          room[gameKey]._voteCollector = VoteCollector.create({
            getExpectedCount: () => activePlayers(room).length,
            allowSelfVote: scoreConfig.allowSelfVote || false,
            onVote: (voterId, targetId) => {
              room[gameKey].votes[voterId] = targetId;
            },
            onComplete: () => game.showResults(io, room, code),
          });

          if (onRoundStart) onRoundStart(io, room, code, round);
        },
        onGameEnd: () => {
          game._sendEnd(io, room, code);
        },
      });

      // Stash managers for host-control handlers (skip, next_round, etc.)
      room[gameKey]._phaseManager = phaseManager;
      room[gameKey]._roundManager = roundManager;

      roundManager.start();
    },

    /**
     * Begin the voting phase (called after prompt/answer collection is done).
     * Starts the countdown timer and emits voting_started to clients.
     *
     * @param {object} io
     * @param {object} room
     * @param {string} code
     * @param {object} [opts]
     * @param {number} [opts.seconds]    - Override votingSeconds for this round
     * @param {object} [opts.extraData]  - Extra fields merged into voting_started emit
     */
    startVoting(io, room, code, { seconds, extraData = {} } = {}) {
      const gameState = room[gameKey];
      if (!gameState) return;

      // Cancel any running timer
      if (room._timers[gameKey]) {
        room._timers[gameKey].cancel();
        room._timers[gameKey] = null;
      }

      gameState.phase = 'voting';
      gameState.paused = false;
      const countdown = seconds || votingSeconds;
      gameState.secondsLeft = countdown;

      room._timers[gameKey] = TimerManager.create({
        io,
        code,
        seconds: countdown,
        tickEvent: EVENTS.TIMER(gameKey),
        isActive: () => room[gameKey]?.phase === 'voting',
        onTick: (s) => { gameState.secondsLeft = s; },
        onPause: () => { gameState.paused = true; },
        onResume: () => { gameState.paused = false; },
        onExpire: () => game.showResults(io, room, code),
      });

      io.to(code).emit(`${gameKey}:voting_started`, {
        players: activePlayers(room).map(p => ({ id: p.id, name: p.name, color: p.color })),
        secondsLeft: countdown,
        round: gameState.round,
        totalRounds: gameState.totalRounds,
        ...extraData,
      });
    },

    /**
     * Close voting, calculate scores, and emit results.
     * Called automatically by the VoteCollector threshold OR timer expiry.
     * Safe to call multiple times — guarded by phase check.
     *
     * @param {object} io
     * @param {object} room
     * @param {string} code
     */
    showResults(io, room, code) {
      const gameState = room[gameKey];
      if (!gameState || gameState.phase === 'results' || gameState.phase === 'ended') return;

      gameState.phase = 'results';

      if (room._timers[gameKey]) {
        room._timers[gameKey].cancel();
        room._timers[gameKey] = null;
      }

      const players = activePlayers(room);
      const { scores: roundScores, voteCounts, winners, maxVotes } =
        calculateVotingScores({
          votes: gameState.votes,
          players,
          config: scoreConfig,
        });

      const resultsPayload = {
        roundScores,
        totalScores: null, // populated below after conditional merge
        voteCounts,
        winners,
        maxVotes,
        round: gameState.round,
        totalRounds: gameState.totalRounds,
        players: players.map(p => ({ id: p.id, name: p.name, color: p.color })),
      };

      if (onResults) {
        // Caller owns scoring — skip the default merge so it doesn't corrupt
        // games that use voter-side scoring (e.g. MLT majority scoring).
        onResults(io, room, code, resultsPayload);
      } else {
        mergeRoundScores(gameState.scores, roundScores);
        resultsPayload.totalScores = { ...gameState.scores };
        io.to(code).emit(EVENTS.RESULTS(gameKey), resultsPayload);
      }
    },

    /**
     * Advance to the next round (called by host next_round handler).
     * @returns {boolean} false if the game has ended
     */
    nextRound(io, room, code) {
      const gameState = room[gameKey];
      if (!gameState?._roundManager) return false;

      if (room._timers[gameKey]) {
        room._timers[gameKey].cancel();
        room._timers[gameKey] = null;
      }

      return gameState._roundManager.nextRound();
    },

    /**
     * Skip the current round without scoring, then advance.
     */
    skipRound(io, room, code) {
      const gameState = room[gameKey];
      if (!gameState?._roundManager) return;

      if (room._timers[gameKey]) {
        room._timers[gameKey].cancel();
        room._timers[gameKey] = null;
      }

      gameState._roundManager.nextRound();
    },

    /** @private */
    _sendEnd(io, room, code) {
      const gameState = room[gameKey];
      if (!gameState) return;

      gameState.phase = 'ended';
      const players = activePlayers(room);
      const leaderboard = buildLeaderboard(gameState.scores, players);

      if (onEnd) {
        onEnd(io, room, code, leaderboard);
      } else {
        io.to(code).emit(EVENTS.END(gameKey), { leaderboard });
      }
    },
  };

  return game;
}

module.exports = { createVotingGame };
