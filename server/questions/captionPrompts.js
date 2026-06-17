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
  // Roast / call-out
  { id: 'caption_16', text: 'What excuse are they about to make up?', category: 'roast' },
  { id: 'caption_17', text: 'What lie is written all over their face right now?', category: 'roast' },
  { id: 'caption_18', text: 'They just got caught. What did they do?', category: 'roast' },
  { id: 'caption_19', text: 'Write the villain origin story that begins with this expression.', category: 'roast' },
  { id: 'caption_20', text: 'What is this person trying to get away with?', category: 'roast' },
  { id: 'caption_21', text: 'Write the one-star review they are about to leave.', category: 'roast' },
  { id: 'caption_22', text: 'What is this person about to cancel plans for?', category: 'roast' },
  // Creative / absurd
  { id: 'caption_23', text: 'Name this NFT and give it a price tag.', category: 'creative' },
  { id: 'caption_24', text: 'Write the headline for the news story featuring this face.', category: 'creative' },
  { id: 'caption_25', text: 'What is their superpower and their one major weakness?', category: 'creative' },
  { id: 'caption_26', text: 'Write the TED Talk title they would give.', category: 'creative' },
  { id: 'caption_27', text: 'Name the true-crime podcast episode this photo belongs in.', category: 'creative' },
  { id: 'caption_28', text: 'What is the chapter title in their memoir for this moment?', category: 'creative' },
  { id: 'caption_29', text: 'Write the IKEA product name for this face.', category: 'creative' },
  { id: 'caption_30', text: 'What is the Yelp review for this person?', category: 'creative' },
  { id: 'caption_31', text: 'Write the Instagram caption they would post with this photo.', category: 'creative' },
  { id: 'caption_32', text: 'What government warning label would go on this person?', category: 'creative' },
  // Internal / psychological
  { id: 'caption_33', text: 'What are the three tabs open in their brain right now?', category: 'internal' },
  { id: 'caption_34', text: 'Translate this expression into a dramatic Shakespearean monologue.', category: 'internal' },
  { id: 'caption_35', text: 'What did they just remember that they completely forgot?', category: 'internal' },
  { id: 'caption_36', text: 'They said "I\'m fine." What is the truth?', category: 'internal' },
  { id: 'caption_37', text: 'What is their villain monologue if they finally snap?', category: 'internal' },
  { id: 'caption_38', text: 'What award are they accepting right now in their head?', category: 'internal' },
  // Situational
  { id: 'caption_39', text: 'Write the job description for whatever they are doing in this photo.', category: 'creative' },
  { id: 'caption_40', text: 'This is their LinkedIn profile photo. What does the bio say?', category: 'creative' },
  { id: 'caption_41', text: 'They are pitching this face on Dragon\'s Den. What is the pitch?', category: 'creative' },
  { id: 'caption_42', text: 'Write the fortune cookie message that perfectly describes this moment.', category: 'creative' },
  { id: 'caption_43', text: 'What is the title of the self-help book they are about to write?', category: 'creative' },
  { id: 'caption_44', text: 'What is the worst possible time for this photo to show up on a big screen?', category: 'roast' },
  { id: 'caption_45', text: 'What reality TV show would immediately cast them based on this photo?', category: 'creative' },
  { id: 'caption_46', text: 'Write the passive-aggressive sticky note they left somewhere today.', category: 'roast' },
  { id: 'caption_47', text: 'What is the red flag that this photo is broadcasting?', category: 'roast' },
  { id: 'caption_48', text: 'Give this face an action-movie tagline.', category: 'creative' },
  { id: 'caption_49', text: 'What speech is happening in their head right now that they will never actually say?', category: 'internal' },
  { id: 'caption_50', text: 'Write the warning label that should appear before interacting with this person today.', category: 'roast' },
];

module.exports = { captionPrompts };
