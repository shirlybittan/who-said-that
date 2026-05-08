// Caption prompts for Selfie Captioning mode.
// Each round picks one prompt from this bank to direct all writers.
// 'category' is for future filtering (safe/cheeky/creative).

const captionPrompts = [
  { id: 'caption_01', text: 'What is this person actually thinking right now?', category: 'internal' },
  { id: 'caption_02', text: 'Write the clickbait YouTube thumbnail title for this photo.', category: 'creative' },
  { id: 'caption_03', text: 'What does their dating app bio say?', category: 'creative' },
  { id: 'caption_04', text: 'Give this "film" a dramatic movie poster title.', category: 'creative' },
  { id: 'caption_05', text: 'What is the worst piece of advice this person is about to give?', category: 'roast' },
  { id: 'caption_06', text: 'Write the caption for their face of regret. What just happened?', category: 'roast' },
  { id: 'caption_07', text: 'What are they about to text their ex?', category: 'roast' },
  { id: 'caption_08', text: 'What Wikipedia article does this face belong in?', category: 'creative' },
  { id: 'caption_09', text: 'Write their next tweet or status update.', category: 'creative' },
  { id: 'caption_10', text: 'What crime are they about to commit?', category: 'roast' },
  { id: 'caption_11', text: 'Write the motivational poster quote for this face.', category: 'creative' },
  { id: 'caption_12', text: 'This person just found out ___. What happened?', category: 'internal' },
  { id: 'caption_13', text: 'Internal monologue: what is the voice in their head saying right now?', category: 'internal' },
  { id: 'caption_14', text: 'The unspoken truth: what is this person actually thinking while they smile?', category: 'internal' },
  { id: 'caption_15', text: 'Write the title of the documentary about their life.', category: 'creative' },
];

module.exports = { captionPrompts };
