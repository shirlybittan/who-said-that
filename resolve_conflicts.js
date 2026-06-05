const fs = require('fs');

const resolveFile = (filePath, overrideType) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  const conflictRegex = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [a-f0-9)+\n]+/g;
  
  content = content.replace(conflictRegex, (match, headerContent, branchContent) => {
    if (overrideType === 'head') return headerContent;
    if (overrideType === 'branch') return branchContent;
    if (typeof overrideType === 'function') return overrideType(headerContent, branchContent);
    return match;
  });
  
  fs.writeFileSync(filePath, content);
};

const resolveUseSocket = () => {
    const filePath = 'client/src/hooks/useSocket.js';
    let content = fs.readFileSync(filePath, 'utf-8');
    
    const conflictRegex = /<<<<<<< HEAD([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [a-f0-9]+/g;
    content = content.replace(conflictRegex, (match, headerContent, branchContent) => {
        // branch content has the shorter logic we want
        return branchContent;
    });
    fs.writeFileSync(filePath, content);
}

const resolveUseMiniGameLifecycle = () => {
    const filePath = 'client/src/hooks/useMiniGameLifecycle.js';
    let content = fs.readFileSync(filePath, 'utf-8');
    
    const conflictRegex = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [a-f0-9]+/g;
    content = content.replace(conflictRegex, (match, headerContent, branchContent) => {
        return ` * @param {Function} onSubmit          Called when the player clicks Confirm
 * @param {*}        resetKey          When this value changes, confirmed state is reset
 *                                     (e.g. pass \`state.currentQuestion\` or \`fitb.question\`)
 * @param {boolean}  initialConfirmed  Start in the confirmed/waiting state — use when
 *                                     restoring a reconnecting player who already submitted.\n`;
    });
    fs.writeFileSync(filePath, content);
}

const resolveDrawTelGuessPage = () => {
    const filePath = 'client/src/pages/DrawTelGuessPage.jsx';
    let content = fs.readFileSync(filePath, 'utf-8');
    const conflictRegex = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [a-f0-9]+/g;
    content = content.replace(conflictRegex, (match, head, branch) => {
        return `    setGuessText('');
    setSecondsLeft(dt.guessSecondsLeft || 60);
  }, [guessTurn?.promptId, dt.guessSecondsLeft]);

  // Capture mutable values in a ref so they don't need to be in the timer's deps
  const autoSubmitRef = useRef({ guessText, guessTurn, roomCode });
  useEffect(() => { autoSubmitRef.current = { guessText, guessTurn, roomCode }; });

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (!hasConfirmed && autoSubmitRef.current.guessTurn) {
        let textToSubmit = autoSubmitRef.current.guessText.trim();
        if (!textToSubmit) textToSubmit = "I had absolutely no idea 🤦‍♂️";
        sounds.answer?.();
        socket.emit('dt:submit_guess', { code: roomCode, promptId: autoSubmitRef.current.guessTurn.promptId, guessText: textToSubmit });
        dispatch({ type: 'DT_MARK_GUESSED' });
      }
      markConfirmed();
    }
  }, [secondsLeft, hasConfirmed, roomCode, sounds, dispatch, markConfirmed]);

  useEffect(() => {
    if (hasConfirmed || !guessTurn || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft, hasConfirmed, guessTurn]);\n`;
    });
    // Remove the extra autoSubmitRef and the useEffect mapping it
    content = content.replace(/\n  \/\/ Capture mutable values in a ref so they don't need to be in the timer's deps\n  const autoSubmitRef = useRef\({ guessText, guessTurn, roomCode }\);\n  useEffect\(\(\) => { autoSubmitRef.current = { guessText, guessTurn, roomCode }; }\);\n/g, '\n');
    fs.writeFileSync(filePath, content);
}

const resolveDrawTelPromptPage = () => {
    const filePath = 'client/src/pages/DrawTelPromptPage.jsx';
    let content = fs.readFileSync(filePath, 'utf-8');
    const conflictRegex = /<<<<<<< HEAD\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> [a-f0-9]+/g;
    content = content.replace(conflictRegex, (match, head, branch) => {
        return `    setSecondsLeft(dt.promptSecondsLeft || 60);
  }, [dt.promptSecondsLeft, dt.totalPrompts]);

  // Capture mutable values in a ref so they don't need to be in the timer's deps
  const autoSubmitRef = useRef({ promptText, hasName, roomCode });
  useEffect(() => { autoSubmitRef.current = { promptText, hasName, roomCode }; });

  useEffect(() => {
    if (secondsLeft <= 0) {
      if (!hasConfirmed) {
        let textToSubmit = autoSubmitRef.current.promptText.trim();
        if (!autoSubmitRef.current.hasName || textToSubmit.length <= 3) {
          textToSubmit = "[name] doing absolutely nothing";
        }
        sounds.answer?.();
        socket.emit('dt:submit_prompt', { code: roomCode, templateText: textToSubmit });
        dispatch({ type: 'DT_MARK_PROMPT_SUBMITTED' });
      }
      markConfirmed();
    }
  }, [secondsLeft, hasConfirmed, roomCode, sounds, markConfirmed, dispatch]);

  useEffect(() => {
    if (hasConfirmed || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [secondsLeft, hasConfirmed]);\n`;
    });
    
    content = content.replace(/\n  \/\/ Capture mutable values in a ref so they don't need to be in the timer's deps\n  const autoSubmitRef = useRef\({ promptText, hasName, roomCode }\);\n  useEffect\(\(\) => { autoSubmitRef.current = { promptText, hasName, roomCode }; }\);\n/g, '\n');
    
    fs.writeFileSync(filePath, content);
}

resolveUseSocket();
resolveUseMiniGameLifecycle();
resolveDrawTelGuessPage();
resolveDrawTelPromptPage();
console.log('Conflicts resolved manually.');
