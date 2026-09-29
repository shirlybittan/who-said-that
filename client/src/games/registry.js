// Single source of truth for every mini-game's identity and how to start it.
//
// Before this registry the same list lived in six places (four in HostPage,
// GameSwitcher, LobbyPage, hostControls) with different names, icons and
// colours, and each "start" switch was copied by hand (AUDIT.md P2-18, P2-34).
// Anything that shows a game's name/icon/rules or starts a game reads it here.
//
// Adding a game? Add an entry here (and in server/game/registry.js), then see
// "How to add a new mini-game" in the README.

export const MIN_PLAYERS = 3;

/**
 * @typedef {object} GameDef
 * @property {string} id
 * @property {string} icon
 * @property {string} accent                    hex colour used for the game's UI accents
 * @property {{en:string, fr:string, he:string}} name
 * @property {{en:string, fr:string, he:string}} rules  1–2 sentences shown on the intro screen
 * @property {(ctx:{code:string, rounds?:number, mode?:string}) => [string, object]} start
 *           socket event + payload that starts the game
 * @property {string} tagline                   short TV picker description
 * @property {boolean} [pickable=true]          offered in game pickers
 * @property {boolean} [playlistable=true]      can be a playlist item
 */

/** @type {GameDef[]} */
export const GAMES = [
  {
    id: 'who-said-that', icon: '🤔', accent: '#FFE66D',
    tagline: "Guess who wrote it!",
    name: { en: 'Who Said That?', fr: 'Qui a dit ça ?', he: 'מי אמר את זה?' },
    rules: {
      en: 'Everyone answers the same question. Then guess who wrote each answer!',
      fr: 'Tout le monde répond à la même question. Devinez ensuite qui a écrit chaque réponse !',
      he: 'כולם עונים על אותה שאלה. אחר כך נחשו מי כתב כל תשובה!',
    },
    start: ({ code, rounds }) => ['start_game', { code, rounds }],
  },
  {
    id: 'situational', icon: '💭', accent: '#A8E6CF',
    tagline: "Answer for someone!",
    name: { en: 'Situational', fr: 'Situationnel', he: 'מצבים' },
    rules: {
      en: 'Each round is about one player. Answer as if you were them, then vote for the best answer.',
      fr: 'Chaque manche parle d’un joueur. Réponds comme si tu étais lui, puis vote pour la meilleure réponse.',
      he: 'כל סבב עוסק בשחקן אחד. ענו כאילו הייתם הוא, ואז הצביעו לתשובה הטובה ביותר.',
    },
    start: ({ code, rounds }) => ['start_game', { code, rounds }],
  },
  {
    id: 'most-likely-to', icon: '👑', accent: '#4ECDC4',
    tagline: "Who fits the prompt?",
    name: { en: 'Most Likely To', fr: 'Plutôt...', he: 'הכי סביר ש...' },
    rules: {
      en: 'Vote for the player who best fits the prompt. Side with the majority to score!',
      fr: 'Vote pour le joueur qui correspond le mieux. Suis la majorité pour marquer !',
      he: 'הצביעו לשחקן שהכי מתאים. הצטרפו לרוב כדי לצבור נקודות!',
    },
    start: ({ code, rounds }) => ['mlt:start', { code, rounds }],
  },
  {
    id: 'this-or-that', icon: '⚡', accent: '#6C5CE7',
    tagline: "Pick a side!",
    name: { en: 'This or That', fr: 'Ceci ou Cela', he: 'זה או זה' },
    rules: {
      en: 'Pick A or B. Points for siding with the majority.',
      fr: 'Choisis A ou B. Des points si tu es avec la majorité.',
      he: 'בחרו A או B. נקודות למי שבחר כמו הרוב.',
    },
    start: ({ code, rounds }) => ['start_game', { code, rounds }],
  },
  {
    id: 'fill-in-the-blank', icon: '✏️', accent: '#55EFC4',
    tagline: "Finish the sentence!",
    name: { en: 'Fill in the Blank', fr: 'Compléter la phrase', he: 'השלם את החסר' },
    rules: {
      en: 'Finish the sentence with your funniest answer, then vote for your favourite.',
      fr: 'Complète la phrase avec ta réponse la plus drôle, puis vote pour ta préférée.',
      he: 'השלימו את המשפט בתשובה הכי מצחיקה, ואז הצביעו למועדפת.',
    },
    start: ({ code, rounds }) => ['fitb:start', { code, rounds }],
  },
  {
    id: 'drawing', icon: '🎨', accent: '#C39BD3',
    tagline: "Draw and vote!",
    name: { en: 'Pictionary Battle', fr: 'Dessine !', he: 'צייר את זה!' },
    rules: {
      en: 'Everyone draws the same word before time runs out. Vote for the best drawing.',
      fr: 'Tout le monde dessine le même mot avant la fin du temps. Vote pour le meilleur dessin.',
      he: 'כולם מציירים את אותה מילה לפני שהזמן נגמר. הצביעו לציור הטוב ביותר.',
    },
    start: ({ code, rounds, mode }) => ['draw:start', { code, rounds, mode: mode || 'classic' }],
  },
  {
    id: 'draw-telephone', icon: '📞', accent: '#FF6B6B',
    tagline: "Draw step by step, guess the prompt!",
    name: { en: 'Drawing in Chain', fr: 'Dessin en chaîne', he: 'ציור בשרשרת' },
    rules: {
      en: 'Write a prompt about a friend. It gets drawn step by step down the chain, then that friend guesses the original.',
      fr: 'Écris une idée sur un ami. Elle est dessinée étape par étape, puis cet ami devine l’original.',
      he: 'כתבו משימה על חבר. היא מצוירת שלב אחרי שלב בשרשרת, ואז החבר מנחש את המקור.',
    },
    start: ({ code }) => ['dt:start', { code }],
  },
  {
    id: 'selfie-roast', icon: '📸', accent: '#FD79A8',
    tagline: "Draw on someone's selfie!",
    name: { en: 'Draw on Friends', fr: 'Dessine sur tes amis', he: 'צייר על חברים' },
    rules: {
      en: 'Take a selfie, then draw on a friend’s selfie to match the prompt. Vote for the funniest.',
      fr: 'Prends un selfie, puis dessine sur celui d’un ami selon le thème. Vote pour le plus drôle.',
      he: 'צלמו סלפי, ואז ציירו על הסלפי של חבר לפי המשימה. הצביעו למצחיק ביותר.',
    },
    start: ({ code, rounds }) => ['selfie:start', { code, rounds }],
  },
  {
    id: 'caption', icon: '💬', accent: '#FD79A8',
    tagline: "Write funny captions!",
    name: { en: 'Selfie Captions', fr: 'Légendes selfie', he: 'כיתובים לסלפי' },
    rules: {
      en: 'Each round features one selfie. Write the best caption for it, then vote.',
      fr: 'Chaque manche met un selfie en avant. Écris la meilleure légende, puis vote.',
      he: 'בכל סבב מוצג סלפי אחד. כתבו את הכיתוב הטוב ביותר, ואז הצביעו.',
    },
    start: ({ code, rounds }) => ['caption:start', { code, rounds }],
  },
  {
    id: 'pmatch', icon: '🎭', accent: '#FDCB6E',
    tagline: "Act out a prompt — best selfie wins!",
    name: { en: 'Selfie Challenge', fr: 'Défi selfie', he: 'אתגר סלפי' },
    rules: {
      en: 'Act out the challenge in a selfie. Vote for the best one.',
      fr: 'Joue le défi dans un selfie. Vote pour le meilleur.',
      he: 'בצעו את האתגר בסלפי. הצביעו לטוב ביותר.',
    },
    start: ({ code, rounds }) => ['photovote:start', { code, subType: 'pmatch', rounds }],
  },
  {
    id: 'photoassoc', icon: '🎯', accent: '#A29BFE',
    tagline: "Vote who matches the vibe!",
    name: { en: 'Prompt Match', fr: 'Qui colle ?', he: 'מי מתאים?' },
    rules: {
      en: 'Vote for the selfie that best matches the prompt.',
      fr: 'Vote pour le selfie qui correspond le mieux au thème.',
      he: 'הצביעו לסלפי שהכי מתאים למשימה.',
    },
    start: ({ code, rounds }) => ['photovote:start', { code, subType: 'photoassoc', rounds }],
  },
  {
    id: 'mixed', icon: '🎲', accent: '#FF8B94', playlistable: false,
    tagline: "All modes shuffled!",
    name: { en: 'Mixed Pack', fr: 'Mixte', he: 'מעורב' },
    rules: {
      en: 'A shuffled mix of games. Every round counts toward one scoreboard.',
      fr: 'Un mélange de jeux. Chaque manche compte pour un seul classement.',
      he: 'תערובת משחקים. כל סבב נספר לטבלה אחת.',
    },
    start: ({ code, rounds }) => ['start_game', { code, rounds }],
  },
];

const BY_ID = Object.fromEntries(GAMES.map(g => [g.id, g]));

/** @returns {GameDef|null} */
export const getGame = (id) => BY_ID[id] || null;

/** Localized game name (falls back to English, then the id). */
export const gameName = (id, lang = 'en') => {
  const g = BY_ID[id];
  return g ? (g.name[lang] || g.name.en) : (id || '');
};

/** "🤔 Who Said That?" */
export const gameLabel = (id, lang = 'en') => {
  const g = BY_ID[id];
  return g ? `${g.icon} ${g.name[lang] || g.name.en}` : (id || '');
};

export const gameRules = (id, lang = 'en') => {
  const g = BY_ID[id];
  return g ? (g.rules[lang] || g.rules.en) : '';
};

/** Emit the start event for a game (used by the TV, the phone host and playlists). */
export const startGame = (socket, id, ctx) => {
  const g = BY_ID[id] || BY_ID['who-said-that'];
  const [event, payload] = g.start(ctx);
  socket.emit(event, payload);
};

export const PICKABLE_GAMES = GAMES.filter(g => g.pickable !== false);
export const PLAYLIST_GAMES = GAMES.filter(g => g.playlistable !== false);
