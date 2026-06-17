const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'server', 'questions');
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));

files.forEach(file => {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Simple hacky way to convert simple `{ text: "...", ... }` to `{ text: { en: "..." }, ... }` without translating
  // We'll use a regex that matches string values in the array objects.
  
  // Actually, since I can't translate thousands of words offline, I will just rewrite `server/index.js` to handle
  // the legacy format natively and fallback to string, and then translate one file as a proof of concept.
});
