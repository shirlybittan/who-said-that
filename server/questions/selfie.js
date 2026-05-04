// Prompts for the "Draw on Selfie" mini-game.
// [Name] is replaced with the photo owner's name at runtime.
// spice: 1=safe, 2=funny, 3=edgy

const selfiePrompts = [
  // ── CHARACTER TRANSFORMATIONS ────────────────────────────────────────────
  { prompt: 'Turn [Name] into a pirate', category: 'character', spice: 1 },
  { prompt: 'Make [Name] a superhero', category: 'character', spice: 1 },
  { prompt: 'Turn [Name] into a supervillain', category: 'character', spice: 1 },
  { prompt: 'Make [Name] a zombie', category: 'character', spice: 2 },
  { prompt: 'Turn [Name] into a vampire', category: 'character', spice: 1 },
  { prompt: 'Make [Name] a robot', category: 'character', spice: 1 },
  { prompt: 'Turn [Name] into an alien', category: 'character', spice: 1 },
  { prompt: 'Make [Name] a medieval knight', category: 'character', spice: 1 },
  { prompt: 'Turn [Name] into a wizard', category: 'character', spice: 1 },
  { prompt: 'Make [Name] a cartoon character', category: 'character', spice: 1 },

  // ── FACIAL EXPRESSION OVERDRIVE ──────────────────────────────────────────
  { prompt: 'Make [Name] look extremely suspicious', category: 'expression', spice: 2 },
  { prompt: 'Make [Name] look guilty', category: 'expression', spice: 2 },
  { prompt: 'Make [Name] look like they\'re lying badly', category: 'expression', spice: 2 },
  { prompt: 'Make [Name] look like they just got caught', category: 'expression', spice: 2 },
  { prompt: 'Make [Name] look terrified', category: 'expression', spice: 1 },
  { prompt: 'Make [Name] look overly confident', category: 'expression', spice: 1 },
  { prompt: 'Make [Name] look like they regret everything', category: 'expression', spice: 2 },
  { prompt: 'Make [Name] look like they\'re about to cry', category: 'expression', spice: 2 },
  { prompt: 'Make [Name] look completely confused', category: 'expression', spice: 1 },
  { prompt: 'Make [Name] look evil', category: 'expression', spice: 2 },

  // ── ROAST / EXAGGERATION ─────────────────────────────────────────────────
  { prompt: 'Make [Name] look like they haven\'t slept in days', category: 'roast', spice: 2 },
  { prompt: 'Make [Name] look 30 years older', category: 'roast', spice: 2 },
  { prompt: 'Make [Name] look like a failed influencer', category: 'roast', spice: 2 },
  { prompt: 'Turn [Name] into their worst version', category: 'roast', spice: 3 },
  { prompt: 'Make [Name] look like they just made a terrible decision', category: 'roast', spice: 2 },
  { prompt: 'Make [Name] look like they\'re hiding something', category: 'roast', spice: 2 },

  // ── ALTERNATE LIVES ───────────────────────────────────────────────────────
  { prompt: 'Turn [Name] into a king/queen', category: 'alternate', spice: 1 },
  { prompt: 'Make [Name] a billionaire', category: 'alternate', spice: 1 },
  { prompt: 'Turn [Name] into a criminal mastermind', category: 'alternate', spice: 2 },
  { prompt: 'Make [Name] a famous actor', category: 'alternate', spice: 1 },
  { prompt: 'Turn [Name] into a chef', category: 'alternate', spice: 1 },
  { prompt: 'Make [Name] a fitness coach', category: 'alternate', spice: 1 },
  { prompt: 'Turn [Name] into a politician', category: 'alternate', spice: 2 },
  { prompt: 'Make [Name] a reality TV star', category: 'alternate', spice: 2 },
  { prompt: 'Turn [Name] into a detective', category: 'alternate', spice: 1 },

  // ── ABSURD / CHAOTIC ──────────────────────────────────────────────────────
  { prompt: 'Turn [Name] into a cult leader', category: 'absurd', spice: 2 },
  { prompt: 'Make [Name] look like they started a conspiracy', category: 'absurd', spice: 2 },
  { prompt: 'Turn [Name] into a meme', category: 'absurd', spice: 2 },
  { prompt: 'Make [Name] look like they caused chaos', category: 'absurd', spice: 2 },
  { prompt: 'Turn [Name] into a weird hybrid animal', category: 'absurd', spice: 1 },
  { prompt: 'Make [Name] look like they\'re from another dimension', category: 'absurd', spice: 1 },
  { prompt: 'Make [Name] look cursed', category: 'absurd', spice: 2 },

  // ── OBJECT / THEME TRANSFORMATIONS ──────────────────────────────────────
  { prompt: 'Turn [Name] into food', category: 'object', spice: 1 },
  { prompt: 'Make [Name] look like a fast-food mascot', category: 'object', spice: 1 },
  { prompt: 'Make [Name] look like a toy', category: 'object', spice: 1 },
  { prompt: 'Turn [Name] into a sticker pack', category: 'object', spice: 1 },
  { prompt: 'Make [Name] look like a video game character', category: 'object', spice: 1 },
  { prompt: 'Turn [Name] into a movie poster', category: 'object', spice: 1 },

  // ── SITUATIONS ────────────────────────────────────────────────────────────
  { prompt: 'Make it look like [Name] just got arrested', category: 'situation', spice: 2 },
  { prompt: 'Make it look like [Name] just won the lottery', category: 'situation', spice: 1 },
  { prompt: 'Make it look like [Name] is in a horror movie', category: 'situation', spice: 2 },
  { prompt: 'Make it look like [Name] is on a dating profile', category: 'situation', spice: 2 },
  { prompt: 'Make it look like [Name] is being interviewed', category: 'situation', spice: 1 },
  { prompt: 'Make it look like [Name] is giving a bad excuse', category: 'situation', spice: 2 },
];

module.exports = { selfiePrompts };
