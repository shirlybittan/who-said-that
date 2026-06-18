const fs = require('fs');

const indexPath = 'server/index.js';
const dtGamePath = 'server/game/dtGame.js';

const lines = fs.readFileSync(indexPath, 'utf8').split('\n');

const selfieStartIdx = lines.findIndex(l => l.includes("socket.on('selfie:start',"));
const dtEndIdx = lines.findIndex(l => l.includes("socket.on('dt:restart',"));

if (selfieStartIdx === -1 || dtEndIdx === -1) {
    console.error("Could not find start or end index. selfieStartIdx:", selfieStartIdx, "dtEndIdx:", dtEndIdx);
    process.exit(1);
}

// Find the end of the dt:restart block
let endIdx = dtEndIdx;
let bracketCount = 0;
let foundStart = false;
for (let i = dtEndIdx; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('{')) {
        bracketCount += (line.match(/\{/g) || []).length;
        foundStart = true;
    }
    if (line.includes('}')) {
        bracketCount -= (line.match(/\}/g) || []).length;
    }
    if (foundStart && bracketCount === 0) {
        endIdx = i;
        break;
    }
}

// Extract lines
const extractedLines = lines.slice(selfieStartIdx, endIdx + 1);

// We need to wrap the extracted lines in a module
const moduleCode = `const { selfiePrompts } = require('../questions/selfie');
const { words: drawWordBank, prompts: drawPrompts } = require('../questions/drawing');
const TimerManager = require('./TimerManager');
const VoteCollector = require('./VoteCollector');
const { buildMiniGameSnapshot } = require('./miniGameSnapshot');
const { shuffleAnswers } = require('./gameLogic');
const {
  createRoom,
  joinRoom,
  getRoom,
  getRoomBySocketId,
  removePlayerBySocketId,
  setGameOptions,
  touchRoom,
  evictStaleRooms,
} = require('./roomManager');

// We need to pass in dependencies from index.js
function setupDtGame(io, socket, {
  getPlayerSocket,
  findPlayer,
  cancelAllTimers,
  mergeToGlobalScores,
  fisherYatesShuffle,
  selectWithHistory,
}) {
${extractedLines.join('\n')}
}

module.exports = { setupDtGame };
`;

fs.writeFileSync(dtGamePath, moduleCode, 'utf8');

// Now remove the lines from index.js and inject the setup call
const newIndexLines = [
    ...lines.slice(0, selfieStartIdx),
    `    setupDtGame(io, socket, { getPlayerSocket, findPlayer, cancelAllTimers, mergeToGlobalScores, fisherYatesShuffle, selectWithHistory });`,
    ...lines.slice(endIdx + 1)
];

// Add the require at the top
const finalIndexLines = [];
let hasInjectedRequire = false;
for (const line of newIndexLines) {
    if (line.includes("const { createMltGame }") && !hasInjectedRequire) {
        finalIndexLines.push(`const { setupDtGame } = require('./game/dtGame');`);
        hasInjectedRequire = true;
    }
    finalIndexLines.push(line);
}

fs.writeFileSync(indexPath, finalIndexLines.join('\n'), 'utf8');
console.log("Refactoring complete.");
