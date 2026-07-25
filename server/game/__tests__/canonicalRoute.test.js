const { computeCanonicalRoute } = require('../canonicalRoute');

const room = (over = {}) => ({
  phase: 'question',
  players: [{ id: 'me', joinedMidRound: false }],
  ...over,
});

const route = (over, playerId = 'me') => computeCanonicalRoute(room(over), playerId);

describe('computeCanonicalRoute', () => {
  test('null when room or player is missing', () => {
    expect(computeCanonicalRoute(null, 'me')).toBeNull();
    expect(route({}, 'nobody')).toBeNull();
  });

  test('mid-round joiner waits in the lobby', () => {
    expect(computeCanonicalRoute(
      room({ phase: 'voting', players: [{ id: 'me', joinedMidRound: true }] }), 'me',
    )).toBe('/lobby');
  });

  test('maps the straightforward phases', () => {
    expect(route({ phase: 'question' })).toBe('/question');
    expect(route({ phase: 'voting' })).toBe('/vote');
    expect(route({ phase: 'sit-results' })).toBe('/sit-vote');
    expect(route({ phase: 'roundEnd' })).toBe('/round-end');
    expect(route({ phase: 'gameEnd' })).toBe('/game-end');
    expect(route({ phase: 'drawing' })).toBe('/draw');
    expect(route({ phase: 'tot' })).toBe('/tot');
    expect(route({ phase: 'fitb' })).toBe('/fitb');
    expect(route({ phase: 'lobby' })).toBe('/lobby');
    expect(route({ phase: 'something-new' })).toBe('/lobby');
  });

  test('resolves mlt / selfie / caption / photovote sub-phases', () => {
    expect(route({ phase: 'mlt', mlt: { roundState: 'voting' } })).toBe('/mlt-vote');
    expect(route({ phase: 'mlt', mlt: { roundState: 'results' } })).toBe('/mlt-results');
    expect(route({ phase: 'selfie', selfie: { phase: 'drawing' } })).toBe('/selfie-draw');
    expect(route({ phase: 'selfie', selfie: { phase: 'voting' } })).toBe('/selfie-vote');
    expect(route({ phase: 'caption', caption: { phase: 'writing' } })).toBe('/caption-write');
    expect(route({ phase: 'photovote', photoVote: { phase: 'voting' } })).toBe('/photo-vote');
  });

  describe('draw telephone — per-player routing', () => {
    test('drawing: only the active drawer goes to the draw screen', () => {
      const dt = { phase: 'drawing', activeTurns: { me: 'p1' }, chains: { p1: {} } };
      expect(route({ phase: 'dt', dt })).toBe('/draw-tel-draw');
      const dtOther = { phase: 'drawing', activeTurns: { other: 'p1' }, chains: { p1: {} } };
      expect(route({ phase: 'dt', dt: dtOther })).toBe('/draw-tel-wait');
    });

    test('guessing: target guesses, others wait, and a done guesser waits', () => {
      const chains = { p1: { targetPlayerId: 'me' } };
      expect(route({ phase: 'dt', dt: { phase: 'guessing', chains } })).toBe('/draw-tel-guess');
      // already guessed → wait
      expect(route({ phase: 'dt', dt: { phase: 'guessing', chains, guesses: { p1: 'cat' } } })).toBe('/draw-tel-wait');
      // not the target → wait
      const otherChains = { p1: { targetPlayerId: 'other' } };
      expect(route({ phase: 'dt', dt: { phase: 'guessing', chains: otherChains } })).toBe('/draw-tel-wait');
    });

    test('reveal and end', () => {
      expect(route({ phase: 'dt', dt: { phase: 'reveal' } })).toBe('/draw-tel-reveal');
      expect(route({ phase: 'dt', dt: { phase: 'end' } })).toBe('/draw-tel-end');
      expect(route({ phase: 'dtEnd' })).toBe('/draw-tel-end');
    });
  });
});
