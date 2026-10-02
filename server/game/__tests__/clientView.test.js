const { roomForPlayer } = require('../clientView');

const answers = [
  { playerId: 'p1', playerName: 'Alice', text: 'mine' },
  { playerId: 'p2', playerName: 'Bob', text: 'secret' },
];

describe('roomForPlayer (P2-36)', () => {
  it('never sends the photo bank', () => {
    const view = roomForPlayer({ phase: 'lobby', playerPhotos: { p1: 'data:image/jpeg;base64,AAA' } }, 'p1');
    expect(view).not.toHaveProperty('playerPhotos');
  });

  it('answering: own answer kept, others only say that they answered', () => {
    const view = roomForPlayer({ phase: 'question', answers }, 'p1');
    expect(view.answers).toEqual([answers[0], { playerId: 'p2' }]);
  });

  it('voting: texts kept, other authors hidden', () => {
    const view = roomForPlayer({ phase: 'voting', answers }, 'p1');
    expect(view.answers[1]).toEqual({ text: 'secret' });
    expect(JSON.stringify(view)).not.toContain('Bob');
  });

  it('round end reveals authors as before', () => {
    const view = roomForPlayer({ phase: 'roundEnd', answers }, 'p1');
    expect(view.answers).toEqual(answers);
  });

  it('does not mutate the room', () => {
    const room = { phase: 'voting', answers, playerPhotos: {} };
    roomForPlayer(room, 'p1');
    expect(room.answers[1].playerId).toBe('p2');
    expect(room).toHaveProperty('playerPhotos');
  });
});
