import { createEmptyHostFrame, createEmptyPlayerFrame } from '../types/gameFrame.contract';

export const drawingAdapter = {
  selectHostFrame(state) {
    const base = createEmptyHostFrame();
    return {
      ...base,
      roomCode: state?.gameInfo?.code || state?.roomCode || '',
      showQr: true,
      joinUrl: state?.joinUrl,
      timer: {
        secondsLeft: state?.drawing?.timer?.left ?? 60,
        paused: state?.drawing?.timer?.paused ?? false,
        total: 60,
      },
      playerStatuses: (state?.players || []).filter((p) => p.isPlaying).map(p => ({
        id: p.id, name: p.name, color: p.color, status: 'waiting'
      })),
      paused: state?.drawing?.timer?.paused ?? false,
      prompt: state?.drawing?.currentPrompt || '',
      roundLabel: `Round ${state?.drawing?.round || '1'}`,
    };
  },
  createHostActions({ socket, roomCode, state }) {
    return {
      togglePause: () => {
        if (!socket || !roomCode) return;
        socket.emit('drawing:toggle_pause', { code: roomCode });
      },
      changeQuestion: () => {
        if (!socket || !roomCode) return;
        socket.emit('drawing:change_question', { code: roomCode });
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
      gameName: state?.gameName || 'Drawing',
      roundLabel: state?.drawing?.round ? `Round ${state.drawing.round}` : "Round 1",
      prompt: state?.drawing?.currentPrompt || "",
      timer: { secondsLeft: state?.drawing?.timer?.left ?? 60, paused: state?.drawing?.timer?.paused ?? false, total: 60 },
      choices: state?.drawing?.choices || [],
      joker: { left: state?.drawing?.jokers ?? 0, active: state?.drawing?.jokerActive ?? false, enabled: (state?.drawing?.jokers ?? 0) > 0 },
      hasSubmitted: !!state?.drawing?.hasSubmitted,
      submittedChoice: state?.drawing?.submittedChoice || null,
    };
  },
  createPlayerActions() {
    return {
      submitChoice: () => {},
      toggleJoker: () => {},
    };
  },
};
