import { createEmptyHostFrame, createEmptyPlayerFrame } from '../types/gameFrame.contract';

const getPromptText = (prompt) => (typeof prompt === 'object' ? (prompt?.en || prompt) : (prompt || ''));

export const mostLikelyToAdapter = {
  selectHostFrame(state) {
    const base = createEmptyHostFrame();
    const mlt = state?.mlt || {};
    const players = (state?.players || []).filter((player) => player.isPlaying && player.isConnected);

    return {
      ...base,
      roomCode: state?.gameInfo?.code || state?.roomCode || '',
      showQr: true,
      joinUrl: state?.joinUrl,
      timer: {
        secondsLeft: mlt.secondsLeft ?? base.timer.secondsLeft,
        paused: !!mlt.paused,
        total: 30,
      },
      progress: {
        current: mlt.voteCount || 0,
        total: mlt.totalVoters || 0,
        label: 'votes in',
      },
      playerStatuses: players.map((player) => ({
        id: player.id,
        name: player.name,
        color: player.color,
        status: (mlt.votedPlayerIds || []).includes(player.id) ? 'voted' : 'waiting',
      })),
      paused: !!mlt.paused,
      prompt: getPromptText(mlt.prompt),
      roundLabel: `Round ${mlt.round || 0} of ${mlt.totalRounds || 0}`,
    };
  },

  createHostActions({ socket, roomCode, state }) {
    return {
      togglePause: () => {
        if (!socket || !roomCode) return;
        if (state?.mlt?.paused) socket.emit('mlt:resume', { code: roomCode });
        else socket.emit('mlt:pause', { code: roomCode });
      },
      changeQuestion: () => {
        if (!socket || !roomCode) return;
        socket.emit('mlt:change_question', { code: roomCode });
      },
      skipQuestion: null,
      skipMiniGame: () => {
        if (!socket || !roomCode) return;
        socket.emit('skip_mini_game', { code: roomCode });
      },
    };
  },

  selectPlayerFrame(state) {
    const base = createEmptyPlayerFrame();
    const mlt = state?.mlt || {};

    return {
      ...base,
      gameName: mlt.gameName || state?.gameName || '',
      roundLabel: `Round ${mlt.round || 0} of ${mlt.totalRounds || 0}`,
      prompt: getPromptText(mlt.prompt),
      timer: {
        secondsLeft: mlt.secondsLeft ?? base.timer.secondsLeft,
        paused: !!mlt.paused,
        total: 30,
      },
      choices: mlt.players || [],
      joker: {
        left: mlt.jokersLeft || 0,
        active: !!mlt.jokerActive,
        enabled: (mlt.jokersLeft || 0) > 0 || !!mlt.jokerActive,
      },
      hasSubmitted: !!mlt.hasVoted,
      submittedChoice: (mlt.players || []).find((player) => player.id === mlt.votedPlayerId) || null,
    };
  },

  createPlayerActions({ socket, roomCode, dispatch, context }) {
    const sounds = context?.sounds;
    return {
      submitChoice: (choice) => {
        if (!socket || !roomCode || !choice?.id) return;
        sounds?.vote?.();
        socket.emit('mlt:vote', { code: roomCode, targetPlayerId: choice.id });
        dispatch?.({ type: 'MLT_MARK_VOTED', payload: { votedPlayerId: choice.id } });
      },
      toggleJoker: () => {
        if (!socket || !roomCode) return;
        sounds?.joker?.();
        socket.emit('mlt:toggle_joker', { code: roomCode });
      },
      chooseChoice: () => {
        sounds?.click?.();
      },
    };
  },
};
