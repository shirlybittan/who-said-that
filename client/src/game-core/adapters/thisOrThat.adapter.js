import { createEmptyHostFrame, createEmptyPlayerFrame } from '../types/gameFrame.contract';

export const thisOrThatAdapter = {
  selectHostFrame(state) {
    const base = createEmptyHostFrame();
    const tot = state?.tot || {};
    const players = (state?.players || []).filter((p) => p.isPlaying && p.isConnected);

    return {
      ...base,
      roomCode: state?.gameInfo?.code || state?.roomCode || '',
      showQr: true,
      joinUrl: state?.joinUrl,
      timer: {
        secondsLeft: tot.secondsLeft ?? 0,
        paused: !!tot.paused,
        total: tot.timeLimit || 30,
      },
      progress: {
        current: tot.voteCount || 0,
        total: tot.totalVoters || 0,
        label: 'votes in',
      },
      playerStatuses: players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        status: (tot.votedPlayerIds || []).includes(p.id) ? 'voted' : 'waiting',
      })),
      statusLabel: 'Voted',
      paused: !!tot.paused,
      prompt: tot.question || '',
      roundLabel: `Round ${tot.round || 0} of ${tot.totalRounds || 0}`,
      // ToT-specific extras passed to center content
      a: tot.a || '',
      b: tot.b || '',
      resultsVisible: !!tot.resultsVisible,
      pctA: tot.pctA || 0,
      pctB: tot.pctB || 0,
      countA: tot.countA || 0,
      countB: tot.countB || 0,
      majorityChoice: tot.majorityChoice || null,
      scores: tot.scores || {},
    };
  },

  createHostActions({ socket, roomCode }) {
    return {
      togglePause: () => {
        if (!socket || !roomCode) return;
        // Read current paused state from the emitted event — adapter is stateless,
        // so we rely on the server toggling via separate pause/resume events.
        socket.emit('tot:pause', { code: roomCode });
      },
      togglePauseResume: (paused) => {
        if (!socket || !roomCode) return;
        if (paused) socket.emit('tot:resume', { code: roomCode });
        else socket.emit('tot:pause', { code: roomCode });
      },
      changeQuestion: () => {
        if (!socket || !roomCode) return;
        socket.emit('tot:change_question', { code: roomCode });
      },
      nextRound: () => {
        if (!socket || !roomCode) return;
        socket.emit('tot:next_round', { code: roomCode });
      },
      skipMiniGame: () => {
        if (!socket || !roomCode) return;
        socket.emit('skip_mini_game', { code: roomCode });
      },
    };
  },

  selectPlayerFrame(state, context = {}) {
    const base = createEmptyPlayerFrame();
    const tot = state?.tot || {};
    const labels = context.labels || {};

    return {
      ...base,
      gameName: state?.gameName || 'This or That',
      roundLabel: `${labels.round || 'Round'} ${tot.round || 0} ${labels.of || 'of'} ${tot.totalRounds || 0}`,
      promptLabel: labels.promptLabel || '⚡ This or That',
      prompt: tot.question || '',
      timer: {
        secondsLeft: tot.secondsLeft ?? 0,
        paused: !!tot.paused,
        total: tot.timeLimit || 30,
      },
      // choices: [{id: 'a', label: tot.a, badge: 'A'}, {id: 'b', label: tot.b, badge: 'B'}]
      choices: [
        { id: 'a', label: tot.a || '', badge: 'A' },
        { id: 'b', label: tot.b || '', badge: 'B' },
      ],
      hasSubmitted: !!tot.hasVoted,
      submittedChoice: tot.hasVoted
        ? { id: tot.myChoice, label: tot.myChoice === 'a' ? tot.a : tot.b, badge: tot.myChoice?.toUpperCase() }
        : null,
      voteCount: tot.voteCount || 0,
      totalVoters: tot.totalVoters || 0,
      resultsVisible: !!tot.resultsVisible,
    };
  },

  createPlayerActions({ socket, roomCode, dispatch, context }) {
    const sounds = context?.sounds;
    return {
      submitChoice: (choice) => {
        if (!socket || !roomCode || !choice?.id) return;
        sounds?.vote?.();
        socket.emit('tot:vote', { code: roomCode, choice: choice.id });
        dispatch?.({ type: 'TOT_MARK_VOTED', payload: { choice: choice.id } });
      },
      playChoiceClick: () => {
        sounds?.click?.();
      },
    };
  },
};
