import { createEmptyHostFrame, createEmptyPlayerFrame } from '../types/gameFrame.contract';

export const triviaAdapter = {
  selectHostFrame(state) {
    const base = createEmptyHostFrame();
    return {
      ...base,
      roomCode: state?.gameInfo?.code || state?.roomCode || '',
      showQr: true,
      joinUrl: state?.joinUrl,
      timer: {
        secondsLeft: state?.trivia?.timer?.left ?? 20,
        paused: state?.trivia?.timer?.paused ?? false,
        total: 20,
      },
      playerStatuses: (state?.players || []).filter((p) => p.isPlaying).map(p => ({
        id: p.id, name: p.name, color: p.color, status: 'waiting'
      })),
      paused: state?.trivia?.timer?.paused ?? false,
      prompt: state?.trivia?.currentPrompt || '',
      roundLabel: `Round ${state?.trivia?.round || '1'}`,
    };
  },
  createHostActions({ socket, roomCode, state }) {
    return {
      togglePause: () => {
        if (!socket || !roomCode) return;
        socket.emit('trivia:toggle_pause', { code: roomCode });
      },
      changeQuestion: () => {
        if (!socket || !roomCode) return;
        socket.emit('trivia:change_question', { code: roomCode });
      },
      skipMiniGame: () => {
        if (!socket || !roomCode) return;
        socket.emit('skip_mini_game', { code: roomCode });
      },
    };
  },
  selectPlayerFrame(state) {
    const base = createEmptyPlayerFrame();
    return {
      ...base,
      gameName: state?.gameName || 'Trivia',
      roundLabel: state?.trivia?.round ? `Round ${state.trivia.round}` : "Round 1",
      prompt: state?.trivia?.currentPrompt || "",
      timer: { secondsLeft: state?.trivia?.timer?.left ?? 20, paused: state?.trivia?.timer?.paused ?? false, total: 20 },
      choices: state?.trivia?.choices || [],
      joker: { left: state?.trivia?.jokers ?? 0, active: state?.trivia?.jokerActive ?? false, enabled: (state?.trivia?.jokers ?? 0) > 0 },
      hasSubmitted: !!state?.trivia?.hasSubmitted,
      submittedChoice: state?.trivia?.submittedChoice || null,
    };
  },
  createPlayerActions() {
    return {
      submitChoice: () => {},
      toggleJoker: () => {},
    };
  },
};
