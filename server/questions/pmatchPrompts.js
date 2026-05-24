// Prompts for Who Fits? (pmatch) — Acting & Imitation Challenge.
// Players take a selfie acting out the prompt. Everyone votes for the funniest/most accurate.
// requiresPlayerTarget: true → server injects a random player's name for [Name]

const pmatchPrompts = [
  // ── Imitation Game (acting as a specific player) ──────────────────────────
  { template: 'Take a selfie looking like [Name] when their food delivery finally arrives.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] trying to parallel park with everyone watching.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] after reading a text that says "We need to talk."', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] trying to explain why they are late again.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] the moment they step on a wet patch in fresh socks.', requiresPlayerTarget: true },
  { template: 'Take a selfie imitating [Name] trying to look completely sober in front of someone important.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] when someone eats the last snack they were saving.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] when they realise they left their phone at home.', requiresPlayerTarget: true },

  // ── Hyper-Specific Pride & Success ───────────────────────────────────────
  { template: 'Take a selfie looking incredibly proud after throwing a piece of trash into the bin from across the room.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just argued with customer service — and won.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking smugly proud because you woke up 2 minutes before your alarm.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just sneaked a snack into a movie theater without anyone noticing.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking proud because you finally remembered where you parked the car.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just sent the perfect passive-aggressive reply.', requiresPlayerTarget: false },

  // ── Embarrassment & Awkwardness ───────────────────────────────────────────
  { template: 'Take a selfie looking like you just waved back at someone who was waving at the person behind you.', requiresPlayerTarget: false },
  { template: 'Take a selfie after your stomach just made a massive roaring sound in a completely silent room.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just pushed a clearly labelled "Pull" door.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just accidentally liked an ex\'s 5-year-old photo.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just walked into the wrong public restroom.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just laughed at your own joke before finishing it.', requiresPlayerTarget: false },

  // ── Situational Acting ────────────────────────────────────────────────────
  { template: 'Take a selfie looking like you are running a marathon but deeply regretting every life choice that led to this moment.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are lifting a weight that is just slightly too heavy for you.', requiresPlayerTarget: false },
  { template: 'Take a selfie as a professional bowler watching their ball slowly head directly into the gutter.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are trying to do yoga but your body simply does not bend that way.', requiresPlayerTarget: false },
  { template: 'Take a selfie at the exact moment of the drop on a rollercoaster.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are about to sneeze but it just will not come out.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just opened a bill you were not expecting.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are trying to hold in a laugh during the most serious moment possible.', requiresPlayerTarget: false },
];

module.exports = { pmatchPrompts };
