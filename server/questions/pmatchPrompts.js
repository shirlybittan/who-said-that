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
  { template: 'Take a selfie looking like [Name] the moment they remember something they forgot to do two weeks ago.', requiresPlayerTarget: true },
  { template: 'Take a selfie imitating [Name] trying to pretend they already knew that fact.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] trying to casually leave a party without saying goodbye to anyone.', requiresPlayerTarget: true },
  { template: 'Take a selfie looking like [Name] realising mid-sentence that they have completely forgotten their point.', requiresPlayerTarget: true },

  // ── Hyper-Specific Pride & Success ───────────────────────────────────────
  { template: 'Take a selfie looking incredibly proud after throwing a piece of trash into the bin from across the room.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just argued with customer service — and won.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking smugly proud because you woke up 2 minutes before your alarm.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just sneaked a snack into a movie theater without anyone noticing.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking proud because you finally remembered where you parked the car.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just sent the perfect passive-aggressive reply.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking proud after successfully parallel parking on your first attempt.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking victorious because you managed to carry all the shopping bags in one trip.', requiresPlayerTarget: false },

  // ── Embarrassment & Awkwardness ───────────────────────────────────────────
  { template: 'Take a selfie looking like you just waved back at someone who was waving at the person behind you.', requiresPlayerTarget: false },
  { template: 'Take a selfie after your stomach just made a massive roaring sound in a completely silent room.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just pushed a clearly labelled "Pull" door.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just accidentally liked an ex\'s 5-year-old photo.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just walked into the wrong public restroom.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just laughed at your own joke before finishing it.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just called your teacher "Mum" by accident.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are pretending you were not just singing alone in the car while someone watched.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just tripped on a completely flat surface in front of everyone.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just replied-all to a company-wide email by mistake.', requiresPlayerTarget: false },

  // ── Situational Acting ────────────────────────────────────────────────────
  { template: 'Take a selfie looking like you are running a marathon but deeply regretting every life choice that led to this moment.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are lifting a weight that is just slightly too heavy for you.', requiresPlayerTarget: false },
  { template: 'Take a selfie as a professional bowler watching their ball slowly head directly into the gutter.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are trying to do yoga but your body simply does not bend that way.', requiresPlayerTarget: false },
  { template: 'Take a selfie at the exact moment of the drop on a rollercoaster.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are about to sneeze but it just will not come out.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just opened a bill you were not expecting.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are trying to hold in a laugh during the most serious moment possible.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are watching a horror movie but refusing to admit you are scared.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are reading a very long terms-and-conditions document and absolutely losing the will to live.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are five minutes away from winning an argument you started accidentally.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like someone just told you a fun fact you already knew and you are deciding whether to admit it.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are waiting for your name to be called at a doctor\'s office after a 2-hour wait.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you are smiling through the pain of being asked to help someone move house on a Saturday.', requiresPlayerTarget: false },
  { template: 'Take a selfie looking like you just gave very confident directions and are now 90% sure they were wrong.', requiresPlayerTarget: false },
];

module.exports = { pmatchPrompts };
