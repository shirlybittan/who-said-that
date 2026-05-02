// Drawing word bank — words players must sketch during Sketch It! rounds
const words = [
  // Animals
  'cat', 'dog', 'fish', 'bird', 'snake', 'elephant', 'penguin', 'panda',
  'owl', 'rabbit', 'bear', 'lion', 'shark', 'crab', 'butterfly', 'turtle',
  'giraffe', 'frog', 'octopus', 'snail', 'duck', 'whale', 'bee', 'horse',
  // Food & drink
  'pizza', 'hamburger', 'hot dog', 'taco', 'sushi', 'donut', 'cake',
  'ice cream', 'banana', 'apple', 'watermelon', 'broccoli', 'cupcake',
  'cookie', 'coffee', 'popcorn', 'sandwich', 'egg', 'cheese', 'mushroom',
  // Nature
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'lightning', 'mountain',
  'volcano', 'tree', 'flower', 'leaf', 'fire', 'wave', 'snowflake', 'cactus',
  // Objects
  'house', 'castle', 'car', 'bicycle', 'rocket', 'boat', 'train', 'airplane',
  'umbrella', 'clock', 'key', 'door', 'chair', 'glasses', 'hat', 'shoes',
  'book', 'guitar', 'camera', 'telephone', 'television', 'lamp', 'balloon',
  'crown', 'sword', 'ring', 'trophy', 'flag', 'bridge', 'lighthouse',
  // People & body
  'smiley face', 'eye', 'hand', 'heart', 'robot', 'alien', 'ghost',
  'superhero', 'wizard', 'pirate', 'mermaid', 'snowman',
  // Concepts & actions
  'sleep', 'dance', 'swim', 'run', 'jump', 'music', 'dream', 'idea', 'magic',
  'thunder', 'shadow', 'speed', 'love', 'peace', 'luck',
  // Characters & professions
  'detective', 'astronaut', 'chef', 'clown', 'ninja', 'vampire', 'zombie',
  'witch', 'knight', 'scientist', 'spy', 'caveman', 'mummy', 'werewolf',
  // Emotions & abstract
  'boredom', 'jealousy', 'panic', 'confidence', 'confusion', 'excitement',
  'karma', 'deadline', 'red flag', 'plot twist', 'hustle', 'vibe',
  // Actions & situations
  'selfie', 'texting', 'crying', 'laughing', 'snoring', 'arguing',
  'napping', 'cheating', 'gossiping', 'overthinking', 'procrastinating',
  // Pop culture & misc
  'wifi', 'meme', 'influencer', 'podcast', 'hangover', 'awkward silence',
  'hot take', 'ghosting', 'situationship', 'main character', 'toxic trait',
];

// Player-specific prompts — {name} is replaced at runtime with a random player's name
const prompts = [
  // Fun
  'Draw {name} as a superhero',
  'Draw {name} on their worst day',
  'Draw {name} as a cartoon villain',
  'Draw {name} trying to cook',
  'Draw {name} before their first coffee',
  'Draw {name} on a first date',
  'Draw {name} winning an Oscar',
  // Roasty
  'Draw {name} when they lie',
  'Draw {name} after 3 days without sleep',
  'Draw {name} getting caught doing something embarrassing',
  'Draw {name} getting away with something',
  "Draw {name}'s most dramatic moment",
  'Draw {name} trying to look cool',
  // Absurd
  'Draw {name} as an alien',
  'Draw {name} in 20 years',
  'Draw {name} ruling the world',
  "Draw {name}'s true personality",
  'Draw {name} as a prehistoric human',
  'Draw {name} as their spirit animal',
  'Draw {name} in a horror movie',
];

module.exports = { words, prompts };
