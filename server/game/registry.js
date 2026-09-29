// Server-side list of mini-games (mirror of client/src/games/registry.js).
//
// `standalone` games run their own flow; the others (WST, Situational, ToT,
// MLT) can also appear as Mixed-pack sub-games. `startEvent` is the socket
// event that starts the game — the intro gate (intro.js) keys off it.

const GAMES = [
  { id: 'who-said-that', standalone: false, startEvent: 'start_game' },
  { id: 'situational', standalone: false, startEvent: 'start_game' },
  { id: 'this-or-that', standalone: false, startEvent: 'start_game' },
  { id: 'most-likely-to', standalone: false, startEvent: 'mlt:start' },
  { id: 'mixed', standalone: false, startEvent: 'start_game' },
  { id: 'drawing', standalone: true, startEvent: 'draw:start' },
  { id: 'fill-in-the-blank', standalone: true, startEvent: 'fitb:start' },
  { id: 'selfie-roast', standalone: true, startEvent: 'selfie:start' },
  { id: 'caption', standalone: true, startEvent: 'caption:start' },
  { id: 'pmatch', standalone: true, startEvent: 'photovote:start' },
  { id: 'photoassoc', standalone: true, startEvent: 'photovote:start' },
  { id: 'draw-telephone', standalone: true, startEvent: 'dt:start' },
];

const GAME_IDS = GAMES.map(g => g.id);
const STANDALONE_IDS = new Set(GAMES.filter(g => g.standalone).map(g => g.id));
const START_EVENTS = new Set([...GAMES.map(g => g.startEvent), 'pmatch:start']);
const isGameId = (id) => GAME_IDS.includes(id);

module.exports = { GAMES, GAME_IDS, STANDALONE_IDS, START_EVENTS, isGameId };
