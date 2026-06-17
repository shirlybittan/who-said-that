const fs = require('fs');

let content = fs.readFileSync('client/src/pages/HostPage.jsx', 'utf8');

// leaderboard
content = content.replace(
  /<div\s+className="flex flex-col gap-2 w-full"/g,
  '<div className="flex flex-col gap-2 w-full" data-testid="host-leaderboard"'
);

// pin
content = content.replace(
  /<p className="text-5xl font-\['Fredoka_One'\] tracking-\[0.2em\] text-white\">\{gameInfo\.code\}<\/p>/g,
  '<p className="text-5xl font-[\'Fredoka_One\'] tracking-[0.2em] text-white" data-testid="host-lobby-pin">{gameInfo.code}</p>'
);

// player list
content = content.replace(
  /<div className="flex flex-wrap gap-4\">\s*\{activePlayers\.map/g,
  '<div className="flex flex-wrap gap-4" data-testid="host-lobby-player-list">\n            {activePlayers.map'
);

// question screen
content = content.replace(
  /<div className="flex flex-col items-center gap-8 w-full max-w-4xl\">/g,
  '<div className="flex flex-col items-center gap-8 w-full max-w-4xl" data-testid="host-question-screen">'
);

fs.writeFileSync('client/src/pages/HostPage.jsx', content);

let lobby = fs.readFileSync('client/src/pages/LobbyPage.jsx', 'utf8');

// start btn
lobby = lobby.replace(
  /className=\`w-full max-w-sm font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-\['Fredoka_One'\] shadow-lg uppercase tracking-wide text-black/g,
  'data-testid="host-btn-start" className={`w-full max-w-sm font-bold py-4 px-6 rounded-xl transition transform active:scale-95 text-xl font-[\'Fredoka_One\'] shadow-lg uppercase tracking-wide text-black'
);

// waiting host
lobby = lobby.replace(
  /<p className="text-\[\#FF6B6B\] font-\['Fredoka_One'\] text-xl animate-pulse\">\{t\.waitingHost\}<\/p>/g,
  '<p className="text-[#FF6B6B] font-[\'Fredoka_One\'] text-xl animate-pulse" data-testid="player-waiting-screen">{t.waitingHost}</p>'
);

fs.writeFileSync('client/src/pages/LobbyPage.jsx', lobby);
console.log("Success");
