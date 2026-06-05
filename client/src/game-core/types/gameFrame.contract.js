export const createEmptyHostFrame = () => ({
  roomCode: '',
  showQr: true,
  timer: { secondsLeft: 0, paused: false, total: 30 },
  progress: { current: 0, total: 0, label: 'votes in' },
  playerStatuses: [],
  paused: false,
  prompt: '',
  roundLabel: '',
});

export const createEmptyPlayerFrame = () => ({
  roundLabel: '',
  prompt: '',
  timer: { secondsLeft: 0, paused: false, total: 30 },
  choices: [],
  joker: { left: 0, active: false, enabled: false },
  hasSubmitted: false,
  submittedChoice: null,
});
