// Drawing word bank — words players must sketch during Sketch It! rounds
const words = [
  // Animals
  'cat', 'dog', 'fish', 'bird', 'snake', 'elephant', 'penguin', 'panda',
  'owl', 'rabbit', 'bear', 'lion', 'shark', 'crab', 'butterfly', 'turtle',
  'giraffe', 'frog', 'octopus', 'snail', 'duck', 'whale', 'bee', 'horse',
  'crocodile', 'flamingo', 'kangaroo', 'cheetah', 'parrot', 'peacock',
  'jellyfish', 'platypus', 'hedgehog', 'hamster', 'lobster', 'scorpion',
  // Food & drink
  'pizza', 'hamburger', 'hot dog', 'taco', 'sushi', 'donut', 'cake',
  'ice cream', 'banana', 'apple', 'watermelon', 'broccoli', 'cupcake',
  'cookie', 'coffee', 'popcorn', 'sandwich', 'egg', 'cheese', 'mushroom',
  'avocado', 'pretzel', 'waffle', 'pancake', 'nachos', 'ramen', 'croissant',
  'strawberry', 'pineapple', 'milkshake', 'boba tea', 'dumplings',
  // Nature
  'sun', 'moon', 'star', 'cloud', 'rainbow', 'lightning', 'mountain',
  'volcano', 'tree', 'flower', 'leaf', 'fire', 'wave', 'snowflake', 'cactus',
  'island', 'tornado', 'waterfall', 'crystal', 'cave', 'glacier', 'comet',
  // Objects
  'house', 'castle', 'car', 'bicycle', 'rocket', 'boat', 'train', 'airplane',
  'umbrella', 'clock', 'key', 'door', 'chair', 'glasses', 'hat', 'shoes',
  'book', 'guitar', 'camera', 'telephone', 'television', 'lamp', 'balloon',
  'crown', 'sword', 'ring', 'trophy', 'flag', 'bridge', 'lighthouse',
  'mirror', 'candle', 'backpack', 'compass', 'telescope', 'hourglass',
  'magnifying glass', 'parachute', 'submarine', 'hot air balloon',
  // People & body
  'smiley face', 'eye', 'hand', 'heart', 'robot', 'alien', 'ghost',
  'superhero', 'wizard', 'pirate', 'mermaid', 'snowman',
  'skeleton', 'angel', 'fairy', 'astronaut on moon',
  // Concepts & actions
  'sleep', 'dance', 'swim', 'run', 'jump', 'music', 'dream', 'idea', 'magic',
  'thunder', 'shadow', 'speed', 'love', 'peace', 'luck',
  'gravity', 'silence', 'mystery', 'chaos', 'balance', 'echo',
  // Characters & professions
  'detective', 'astronaut', 'chef', 'clown', 'ninja', 'vampire', 'zombie',
  'witch', 'knight', 'scientist', 'spy', 'caveman', 'mummy', 'werewolf',
  'mime', 'surgeon', 'firefighter', 'judge', 'pirate captain',
  // Emotions & abstract
  'boredom', 'jealousy', 'panic', 'confidence', 'confusion', 'excitement',
  'karma', 'deadline', 'red flag', 'plot twist', 'hustle', 'vibe',
  'nostalgia', 'anxiety', 'fomo', 'burnout', 'glow up', 'cringe',
  // Actions & situations
  'selfie', 'texting', 'crying', 'laughing', 'snoring', 'arguing',
  'napping', 'cheating', 'gossiping', 'overthinking', 'procrastinating',
  'multitasking', 'eavesdropping', 'photobombing', 'ghosting',
  // Pop culture & misc
  'wifi', 'meme', 'influencer', 'podcast', 'hangover', 'awkward silence',
  'hot take', 'ghosting', 'situationship', 'main character', 'toxic trait',
  'side quest', 'plot armor', 'gaslight', 'era', 'understood the assignment',
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
  // New additions
  'Draw {name} as a medieval peasant',
  'Draw {name} at the Olympics',
  'Draw {name} as a fast-food mascot',
  'Draw {name} as a movie poster',
  'Draw {name} as a pirate captain',
  'Draw {name} discovering a superpower for the first time',
  'Draw {name} trying to explain something nobody asked about',
  'Draw {name} as a weather forecast',
  'Draw {name} as their most chaotic self',
  'Draw {name} in their natural habitat',
  'Draw {name} at the exact moment they realise they were wrong',
  'Draw {name} as a news headline',
];

module.exports = { words, prompts };

