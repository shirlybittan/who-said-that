import { useEffect } from 'react';
import { socket } from '../socket';
import { useGame } from '../store/gameStore.jsx';
import { useNavigate } from 'react-router-dom';

export const useSocket = () => {
  const { state, dispatch } = useGame();
  const navigate = useNavigate();

  useEffect(() => {
    const onConnect = () => {
      const savedId = localStorage.getItem('wst_playerId');
      const savedCode = localStorage.getItem('wst_roomCode');
      const savedName = localStorage.getItem('wst_playerName');
      if (savedId && savedCode && savedName) {
        socket.emit('join_room', { code: savedCode, playerName: savedName, playerId: savedId });
      }
    };

    const onRoomCreated = ({ code, playerId, players, gameType, gameName, selectedSubGames, isPlaying, roomConfig, globalScores }) => {
      localStorage.setItem('wst_roomCode', code);
      const myPlayer = players?.find(p => p.id === playerId);
      if (myPlayer?.name) localStorage.setItem('wst_playerName', myPlayer.name);
      dispatch({ type: 'SET_ROOM', payload: { roomCode: code, phase: 'lobby', isHost: true, isPlaying: !!isPlaying, players, gameType, gameName: gameName || '', selectedSubGames, roomConfig: roomConfig || {}, globalScores: globalScores || {} } });
      dispatch({ type: 'SET_PLAYER_ID', payload: playerId });
      navigate('/lobby');
    };

    const onJoinSuccess = ({ room, playerId, isRejoin }) => {
      localStorage.setItem('wst_roomCode', room.code);
      const myPlayer = room.players.find(p => p.id === playerId);
      if (myPlayer?.name) localStorage.setItem('wst_playerName', myPlayer.name);
      const isPlaying = myPlayer?.isPlaying ?? true;
      const isHost = room.host === playerId;
      const phase = room.phase;
      const joinedMidRound = !isRejoin && phase && phase !== 'lobby';

      dispatch({
        type: 'SET_ROOM',
        payload: {
          roomCode: room.code,
          phase: room.phase,
          players: room.players,
          mode: room.mode,
          totalRounds: room.totalRounds,
          currentRound: room.currentRound || 0,
          isHost,
          isPlaying,
          joinedMidRound: !!joinedMidRound,
          gameType: room.gameType || 'who-said-that',
          selectedSubGames: room.selectedSubGames || [],
          gameName: room.gameName || '',
          scores: room.scores || {},
          mlt: {
            totalRounds: room.mlt?.totalRounds ?? 5,
            allowSelfVote: room.mlt?.allowSelfVote ?? false,
          },
        } 
      });
      dispatch({ type: 'SET_PLAYER_ID', payload: playerId });

      // Brand-new player joining mid-game — hold in lobby until next round
      if (joinedMidRound) {
        navigate('/lobby');
        return;
      }

      // Mid-game rejoin: restore phase-specific state and navigate to correct page
      if (phase === 'lobby' || !phase) {
        navigate('/lobby');
        return;
      }

      if (phase === 'question') {
        const q = room.questions?.[room.currentQuestionIndex];
        dispatch({
          type: 'SET_QUESTION',
          payload: {
            question: room.currentQuestion,
            round: room.currentRound,
            totalRounds: room.totalRounds,
            roundType: q?.type || 'wst',
            target: null,
          }
        });
        if (room.answers?.some(a => a.playerId === playerId)) {
          dispatch({ type: 'MARK_ANSWERED' });
        }
        navigate('/question');
      } else if (phase === 'sit-voting' || phase === 'sit-results') {
        const answers = room.answers?.map(a => ({ id: a.playerId, text: a.text })) || [];
        dispatch({
          type: 'SIT_VOTING_STARTED',
          payload: { question: room.currentQuestion, answers, totalVoters: room.players.filter(p => p.isConnected && p.isPlaying).length }
        });
        if (phase === 'sit-results') {
          // results will come via sit:results if host triggers, otherwise show voting page
        } else if (room.sit?.votes?.[playerId]) {
          dispatch({ type: 'SIT_MARK_VOTED', payload: { answerId: room.sit.votes[playerId] } });
        }
        navigate('/sit-vote');
      } else if (phase === 'voting') {
        dispatch({
          type: 'SET_ANSWERS',
          payload: {
            answers: room.answers?.map(a => ({ text: a.text })) || [],
            currentIndex: room.currentAnswerIndex || 0,
          }
        });
        navigate('/vote');
      } else if (phase === 'roundEnd') {
        dispatch({ type: 'SET_ROUND_ENDED', payload: { scores: room.scores, players: room.players, answers: room.answers || [], stats: {} } });
        navigate('/round-end');
      } else if (phase === 'gameEnd') {
        dispatch({ type: 'SET_GAME_ENDED', payload: { players: room.players, stats: {} } });
        navigate('/game-end');
      } else if (phase === 'tot') {
        const q = room.questions?.[room.currentQuestionIndex];
        dispatch({
          type: 'SET_TOT_QUESTION',
          payload: {
            question: q?.text || room.currentQuestion || '',
            a: q?.a || '',
            b: q?.b || '',
            round: room.currentRound,
            totalRounds: room.totalRounds,
          }
        });
        navigate('/tot');
      } else {
        navigate('/lobby');
      }
    };

    const onPlayerJoined = ({ players }) => {
      dispatch({ type: 'UPDATE_PLAYERS', payload: players });
    };

    const onOptionsUpdated = ({ mode, totalRounds, customQuestions, gameType, selectedSubGames, mltTotalRounds, mltAllowSelfVote }) => {
      dispatch({ type: 'SET_OPTIONS', payload: { mode, totalRounds, customQuestions, gameType, selectedSubGames, mltTotalRounds, mltAllowSelfVote } });
    };

    const onCustomQuestionsUpdated = ({ customQuestions }) => {
      dispatch({ type: 'UPDATE_CUSTOM_QUESTIONS', payload: customQuestions });
    };

    const onPlayerDisconnected = ({ playerId, playerName }) => {
      // Logic for disconnect goes here if needed
    };

    const onGameStarted = (data) => {
      dispatch({ type: 'SET_GAME_STARTED', payload: data });
      // Navigation is handled by onNewQuestion (which always follows game_started)
    };

    const onNewQuestion = (data) => {
      dispatch({ type: 'SET_ROOM', payload: { joinedMidRound: false } });
      if (data.roundType === 'this-or-that') {
        dispatch({ type: 'SET_TOT_QUESTION', payload: data });
        navigate('/tot');
      } else {
        dispatch({ type: 'SET_QUESTION', payload: data });
        navigate('/question');
      }
    };

    const onAnswerReceived = (data) => {
      dispatch({ type: 'SET_ANSWERED_COUNT', payload: data });
    };

    const onVotingStarted = (data) => {
      dispatch({ type: 'SET_ANSWERS', payload: data });
      navigate('/vote');
    };

    const onMyAnswerIndex = ({ index }) => {
      dispatch({ type: 'SET_MY_ANSWER_INDEX', payload: { index } });
    };

    const onVoteReceived = (data) => {
      dispatch({ type: 'SET_VOTE_COUNT', payload: data });
    };

    const onAllVotesIn = () => {
      dispatch({ type: 'ALL_VOTES_IN' });
    };

    const onAnswerRevealed = (data) => {
      dispatch({ type: 'REVEAL_ANSWER', payload: data });
    };

    const onNextAnswer = (data) => {
      dispatch({ type: 'START_NEXT_ANSWER', payload: data });
    };

    const onRoundEnded = (data) => {
      dispatch({ type: 'SET_ROUND_ENDED', payload: data });
      navigate('/round-end'); // Future route
    };

    const onPlayersReady = (data) => {
      dispatch({ type: 'SET_PLAYERS_READY', payload: data });
    };

    const onGameEnded = (data) => {
      dispatch({ type: 'SET_GAME_ENDED', payload: data });
      navigate('/game-end');
    };

    const onHostChanged = ({ host }) => {
      if (state.playerId === host) {
        dispatch({ type: 'SET_ROOM', payload: { isHost: true } });
      }
    };

    const onError = ({ message }) => {
      dispatch({ type: 'SET_ERROR', payload: message });
      alert(message);
    };

    const onKicked = () => {
      alert("You have been kicked from the room.");
      dispatch({ type: 'RESET_GAME' });
      navigate('/');
    };

    // ─── Most Likely To handlers ─────────────────────────────────────────────
    const onMltPrompt = (data) => {
      dispatch({ type: 'SET_ROOM', payload: { joinedMidRound: false } });
      dispatch({ type: 'MLT_SET_PROMPT', payload: data });
      navigate('/mlt-vote');
    };

    const onMltQuestionChanged = (data) => {
      dispatch({ type: 'MLT_QUESTION_CHANGED', payload: data });
    };

    const onMltTimer = (data) => {
      dispatch({ type: 'MLT_SET_TIMER', payload: data });
    };

    const onMltVoteReceived = (data) => {
      dispatch({ type: 'MLT_VOTE_RECEIVED', payload: data });
    };

    const onMltResults = (data) => {
      dispatch({ type: 'MLT_SET_RESULTS', payload: data });
      navigate('/mlt-results');
    };

    const onMltEnd = (data) => {
      dispatch({ type: 'MLT_SET_END', payload: data });
      navigate('/mlt-end');
    };

    const onMltJokerState = (data) => {
      dispatch({ type: 'MLT_JOKER_STATE', payload: data });
    };

    const onMltPaused = () => {
      dispatch({ type: 'MLT_SET_PAUSED' });
    };

    const onMltResumed = (data) => {
      dispatch({ type: 'MLT_SET_RESUMED', payload: data });
    };

    const onMltRestarted = ({ code, gameName, players, gameType }) => {
      dispatch({ type: 'MLT_RESTARTED', payload: { gameName, players, gameType } });
      navigate('/lobby');
    };

    // ─── This-or-That handlers ───────────────────────────────────────────────
    const onTotVoteReceived = (data) => {
      dispatch({ type: 'TOT_VOTE_RECEIVED', payload: data });
    };

    const onTotResults = (data) => {
      dispatch({ type: 'TOT_SET_RESULTS', payload: data });
    };

    const onTotEnd = (data) => {
      dispatch({ type: 'TOT_SET_END', payload: data });
      navigate('/tot-end');
    };
    // ─── Situational handlers ──────────────────────────────────────────────
    const onSitVotingStarted = (data) => {
      dispatch({ type: 'SIT_VOTING_STARTED', payload: data });
      navigate('/sit-vote');
    };

    const onSitVoteReceived = (data) => {
      dispatch({ type: 'SIT_VOTE_RECEIVED', payload: data });
    };

    const onSitResults = (data) => {
      dispatch({ type: 'SIT_SET_RESULTS', payload: data });
    };

    // ─── Drawing handlers ─────────────────────────────────────────────────
    const onDrawRoundStart = (data) => {
      dispatch({ type: 'SET_ROOM', payload: { joinedMidRound: false } });
      dispatch({ type: 'DRAW_SET_ROUND', payload: data });
      navigate('/draw');
    };

    const onDrawTimer = (data) => {
      dispatch({ type: 'DRAW_TIMER', payload: data });
    };

    const onDrawSubmissionReceived = (data) => {
      dispatch({ type: 'DRAW_SUBMISSION_RECEIVED', payload: data });
    };

    const onDrawVotingStarted = (data) => {
      dispatch({ type: 'DRAW_VOTING_STARTED', payload: data });
    };

    const onDrawVoteReceived = (data) => {
      dispatch({ type: 'DRAW_VOTE_RECEIVED', payload: data });
    };

    const onDrawResults = (data) => {
      dispatch({ type: 'DRAW_SET_RESULTS', payload: data });
    };

    const onDrawEnd = (data) => {
      dispatch({ type: 'DRAW_SET_END', payload: data });
      navigate('/draw-end');
    };

    const onDrawRestarted = (data) => {
      dispatch({ type: 'DRAW_RESTARTED', payload: data });
      navigate('/lobby');
    };

    const onDrawSecretWord = (data) => {
      dispatch({ type: 'DRAW_SECRET_WORD', payload: data });
    };

    const onDrawWordChanged = (data) => {
      dispatch({ type: 'DRAW_WORD_CHANGED', payload: data });
    };

    // ─── Fill-in-the-Blank handlers ──────────────────────────────────────────
    const onFitbRoundStart = (data) => {
      dispatch({ type: 'SET_ROOM', payload: { joinedMidRound: false } });
      dispatch({ type: 'FITB_ROUND_START', payload: data });
      navigate('/fitb');
    };

    const onFitbAnswerReceived = (data) => {
      dispatch({ type: 'FITB_ANSWER_RECEIVED', payload: data });
    };

    const onFitbVotingStarted = (data) => {
      dispatch({ type: 'FITB_VOTING_STARTED', payload: data });
    };

    const onFitbVoteReceived = (data) => {
      dispatch({ type: 'FITB_VOTE_RECEIVED', payload: data });
    };

    const onFitbResults = (data) => {
      dispatch({ type: 'FITB_RESULTS', payload: data });
    };

    const onFitbEnd = (data) => {
      dispatch({ type: 'FITB_END', payload: data });
      navigate('/fitb-end');
    };

    const onFitbRestarted = (data) => {
      dispatch({ type: 'FITB_RESTARTED', payload: data });
      navigate('/lobby');
    };

    // ─── Selfie Roast handlers ────────────────────────────────────────────────
    const onSelfiePhotoPhase = (data) => {
      dispatch({ type: 'SET_ROOM', payload: { joinedMidRound: false } });
      dispatch({ type: 'SELFIE_PHOTO_PHASE', payload: data });
      navigate('/selfie-photo');
    };

    const onSelfiePhotoReceived = (data) => {
      dispatch({ type: 'SELFIE_PHOTO_RECEIVED', payload: data });
    };

    const onSelfieDrawAssigned = (data) => {
      dispatch({ type: 'SELFIE_DRAW_ASSIGNED', payload: data });
      navigate('/selfie-draw');
    };

    const onSelfieDrawingPhase = (data) => {
      dispatch({ type: 'SELFIE_DRAWING_PHASE', payload: data });
    };

    const onSelfieDrawingReceived = (data) => {
      dispatch({ type: 'SELFIE_DRAWING_RECEIVED', payload: data });
    };

    const onSelfieVotingStarted = (data) => {
      dispatch({ type: 'SELFIE_VOTING_STARTED', payload: data });
      navigate('/selfie-vote');
    };

    const onSelfieVoteReceived = (data) => {
      dispatch({ type: 'SELFIE_VOTE_RECEIVED', payload: data });
    };

    const onSelfieResults = (data) => {
      dispatch({ type: 'SELFIE_RESULTS', payload: data });
      navigate('/selfie-results');
    };

    const onSelfieRestarted = (data) => {
      dispatch({ type: 'SELFIE_RESTARTED', payload: data });
      navigate('/lobby');
    };

    const onSelfiePromptUpdated = (data) => {
      dispatch({ type: 'SELFIE_UPDATE_PROMPT', payload: data });
    };

    const onSelfieRetakeReady = () => {
      dispatch({ type: 'SELFIE_RETAKE_READY' });
      navigate('/selfie-photo');
    };

    // ─── Caption handlers ──────────────────────────────────────────────────
    const onCaptionPhotoPhase = (data) => {
      dispatch({ type: 'CAPTION_PHOTO_PHASE', payload: data });
      navigate('/caption-photo');
    };
    const onCaptionPhotoSubmitted = (data) => {
      dispatch({ type: 'CAPTION_PHOTO_SUBMITTED', payload: data });
    };
    const onCaptionWritingPhase = (data) => {
      dispatch({ type: 'CAPTION_WRITING_PHASE', payload: data });
      navigate('/caption-write');
    };
    const onCaptionCaptionSubmitted = (data) => {
      dispatch({ type: 'CAPTION_CAPTION_SUBMITTED', payload: data });
    };
    const onCaptionVotingPhase = (data) => {
      dispatch({ type: 'CAPTION_VOTING_PHASE', payload: data });
      navigate('/caption-vote');
    };
    const onCaptionYourCaptionId = (data) => {
      dispatch({ type: 'CAPTION_SET_OWN_ID', payload: data });
    };
    const onCaptionVoteReceived = (data) => {
      dispatch({ type: 'CAPTION_VOTE_RECEIVED', payload: data });
    };
    const onCaptionRoundResults = (data) => {
      dispatch({ type: 'CAPTION_ROUND_RESULTS', payload: data });
      navigate('/caption-results');
    };
    const onCaptionGameOver = (data) => {
      dispatch({ type: 'CAPTION_GAME_OVER', payload: data });
      navigate('/caption-results');
    };
    const onCaptionRestarted = (data) => {
      dispatch({ type: 'CAPTION_RESTARTED', payload: data });
      navigate('/lobby');
    };

    // ─── PhotoVote handlers ────────────────────────────────────────────────
    const onPhotoVotePhotoPhase = (data) => {
      dispatch({ type: 'PHOTOVOTE_PHOTO_PHASE', payload: data });
      navigate('/photo-vote-photo');
    };
    const onPhotoVotePhotoSubmitted = (data) => {
      dispatch({ type: 'PHOTOVOTE_PHOTO_SUBMITTED', payload: data });
    };
    const onPhotoVoteVotingPhase = (data) => {
      dispatch({ type: 'PHOTOVOTE_VOTING_PHASE', payload: data });
      navigate('/photo-vote');
    };
    const onPhotoVoteVoteReceived = (data) => {
      dispatch({ type: 'PHOTOVOTE_VOTE_RECEIVED', payload: data });
    };
    const onPhotoVoteRoundResults = (data) => {
      dispatch({ type: 'PHOTOVOTE_ROUND_RESULTS', payload: data });
      navigate('/photo-vote-results');
    };
    const onPhotoVoteGameOver = (data) => {
      dispatch({ type: 'PHOTOVOTE_GAME_OVER', payload: data });
      navigate('/photo-vote-results');
    };
    const onPhotoVoteRestarted = (data) => {
      dispatch({ type: 'PHOTOVOTE_RESTARTED', payload: data });
      navigate('/lobby');
    };

    const onGameChanged = ({ code, gameType, players, gameName }) => {
      dispatch({ type: 'GAME_SWITCHED', payload: { gameType, players, gameName } });
      navigate('/lobby');
    };
    // ────────────────────────────────────────────────────────────────────────

    socket.on('connect', onConnect);
    socket.on('room_created', onRoomCreated);
    socket.on('join_success', onJoinSuccess);
    socket.on('player_joined', onPlayerJoined);
    socket.on('options_updated', onOptionsUpdated);
    socket.on('custom_questions_updated', onCustomQuestionsUpdated);
    socket.on('player_disconnected', onPlayerDisconnected);
    socket.on('host_changed', onHostChanged);
    socket.on('game_started', onGameStarted);
    socket.on('new_question', onNewQuestion);
    socket.on('answer_received', onAnswerReceived);
    socket.on('voting_started', onVotingStarted);
    socket.on('my_answer_index', onMyAnswerIndex);
    socket.on('vote_received', onVoteReceived);
    socket.on('all_votes_in', onAllVotesIn);
    socket.on('answer_revealed', onAnswerRevealed);
    socket.on('next_answer', onNextAnswer);
    socket.on('round_ended', onRoundEnded);
    socket.on('players_ready', onPlayersReady);
    socket.on('game_ended', onGameEnded);
    socket.on('error', onError);
    socket.on('kicked', onKicked);
    socket.on('mlt:prompt', onMltPrompt);
    socket.on('mlt:question_changed', onMltQuestionChanged);
    socket.on('mlt:timer', onMltTimer);
    socket.on('mlt:vote_received', onMltVoteReceived);
    socket.on('mlt:results', onMltResults);
    socket.on('mlt:end', onMltEnd);
    socket.on('mlt:joker_state', onMltJokerState);
    socket.on('mlt:paused', onMltPaused);
    socket.on('mlt:resumed', onMltResumed);
    socket.on('mlt:restarted', onMltRestarted);
    socket.on('tot:vote_received', onTotVoteReceived);
    socket.on('tot:results', onTotResults);
    socket.on('tot:end', onTotEnd);
    socket.on('sit:voting_started', onSitVotingStarted);
    socket.on('sit:vote_received', onSitVoteReceived);
    socket.on('sit:results', onSitResults);
    socket.on('draw:round_start', onDrawRoundStart);
    socket.on('draw:timer', onDrawTimer);
    socket.on('draw:submission_received', onDrawSubmissionReceived);
    socket.on('draw:voting_started', onDrawVotingStarted);
    socket.on('draw:vote_received', onDrawVoteReceived);
    socket.on('draw:results', onDrawResults);
    socket.on('draw:end', onDrawEnd);
    socket.on('draw:restarted', onDrawRestarted);
    socket.on('draw:secret_word', onDrawSecretWord);
    socket.on('draw:word_changed', onDrawWordChanged);
    socket.on('fitb:round_start', onFitbRoundStart);
    socket.on('fitb:answer_received', onFitbAnswerReceived);
    socket.on('fitb:voting_started', onFitbVotingStarted);
    socket.on('fitb:vote_received', onFitbVoteReceived);
    socket.on('fitb:results', onFitbResults);
    socket.on('fitb:end', onFitbEnd);
    socket.on('fitb:restarted', onFitbRestarted);
    socket.on('selfie:photo_phase', onSelfiePhotoPhase);
    socket.on('selfie:photo_received', onSelfiePhotoReceived);
    socket.on('selfie:draw_assigned', onSelfieDrawAssigned);
    socket.on('selfie:drawing_phase', onSelfieDrawingPhase);
    socket.on('selfie:drawing_received', onSelfieDrawingReceived);
    socket.on('selfie:voting_started', onSelfieVotingStarted);
    socket.on('selfie:vote_received', onSelfieVoteReceived);
    socket.on('selfie:results', onSelfieResults);
    socket.on('selfie:restarted', onSelfieRestarted);
    socket.on('selfie:prompt_updated', onSelfiePromptUpdated);
    socket.on('selfie:retake_ready', onSelfieRetakeReady);
    socket.on('caption:photo_phase', onCaptionPhotoPhase);
    socket.on('caption:photo_submitted', onCaptionPhotoSubmitted);
    socket.on('caption:writing_phase', onCaptionWritingPhase);
    socket.on('caption:caption_submitted', onCaptionCaptionSubmitted);
    socket.on('caption:voting_phase', onCaptionVotingPhase);
    socket.on('caption:your_caption_id', onCaptionYourCaptionId);
    socket.on('caption:vote_received', onCaptionVoteReceived);
    socket.on('caption:round_results', onCaptionRoundResults);
    socket.on('caption:game_over', onCaptionGameOver);
    socket.on('caption:restarted', onCaptionRestarted);
    socket.on('photovote:photo_phase', onPhotoVotePhotoPhase);
    socket.on('photovote:photo_submitted', onPhotoVotePhotoSubmitted);
    socket.on('photovote:voting_phase', onPhotoVoteVotingPhase);
    socket.on('photovote:vote_received', onPhotoVoteVoteReceived);
    socket.on('photovote:round_results', onPhotoVoteRoundResults);
    socket.on('photovote:game_over', onPhotoVoteGameOver);
    socket.on('photovote:restarted', onPhotoVoteRestarted);

    // ─── Draw Telephone handlers ──────────────────────────────────────────────
    const onDtSelfiePhase = (data) => {
      dispatch({ type: 'DT_SELFIE_PHASE', payload: data });
      navigate('/selfie-photo');
    };
    const onDtPhotoReceived = (data) => {
      dispatch({ type: 'DT_PHOTO_RECEIVED', payload: data });
    };
    const onDtPromptPhase = (data) => {
      dispatch({ type: 'DT_PROMPT_PHASE', payload: data });
      navigate('/draw-tel-prompt');
    };
    const onDtPromptReceived = (data) => {
      dispatch({ type: 'DT_PROMPT_RECEIVED', payload: data });
    };
    const onDtDrawingPhase = (data) => {
      dispatch({ type: 'DT_DRAWING_PHASE', payload: data });
      navigate('/draw-tel-wait');
    };
    const onDtYourTurn = (data) => {
      dispatch({ type: 'DT_YOUR_TURN', payload: data });
      navigate('/draw-tel-draw');
    };
    const onDtTurnTimer = (data) => {
      dispatch({ type: 'DT_TURN_TIMER', payload: data });
    };
    const onDtChainProgress = (data) => {
      dispatch({ type: 'DT_CHAIN_PROGRESS', payload: data });
    };
    const onDtDrawingProgress = (data) => {
      dispatch({ type: 'DT_DRAWING_PROGRESS', payload: data });
    };
    const onDtGuessingPhase = (data) => {
      dispatch({ type: 'DT_GUESSING_PHASE', payload: data });
      // Only navigate to guess page if there's a guessTurn coming (via dt:your_guess)
      // otherwise stay on wait page
      navigate('/draw-tel-wait');
    };
    const onDtYourGuess = (data) => {
      dispatch({ type: 'DT_YOUR_GUESS', payload: data });
      navigate('/draw-tel-guess');
    };
    const onDtGuessReceived = (data) => {
      dispatch({ type: 'DT_GUESS_RECEIVED', payload: data });
    };
    const onDtRevealPhase = (data) => {
      dispatch({ type: 'DT_REVEAL_PHASE', payload: data });
      navigate('/draw-tel-reveal');
    };
    const onDtRevealUpdate = (data) => {
      dispatch({ type: 'DT_REVEAL_UPDATE', payload: data });
    };
    const onDtVoteReceived = (data) => {
      dispatch({ type: 'DT_VOTE_RECEIVED', payload: data });
    };
    const onDtEnd = (data) => {
      dispatch({ type: 'DT_END', payload: data });
      navigate('/draw-tel-end');
    };
    const onDtRestarted = (data) => {
      dispatch({ type: 'DT_RESTARTED', payload: data });
      navigate('/lobby');
    };

    socket.on('dt:selfie_phase', onDtSelfiePhase);
    socket.on('dt:photo_received', onDtPhotoReceived);
    socket.on('dt:prompt_phase', onDtPromptPhase);
    socket.on('dt:prompt_received', onDtPromptReceived);
    socket.on('dt:drawing_phase', onDtDrawingPhase);
    socket.on('dt:your_turn', onDtYourTurn);
    socket.on('dt:turn_timer', onDtTurnTimer);
    socket.on('dt:chain_progress', onDtChainProgress);
    socket.on('dt:drawing_progress', onDtDrawingProgress);
    socket.on('dt:guessing_phase', onDtGuessingPhase);
    socket.on('dt:your_guess', onDtYourGuess);
    socket.on('dt:guess_received', onDtGuessReceived);
    socket.on('dt:reveal_phase', onDtRevealPhase);
    socket.on('dt:reveal_update', onDtRevealUpdate);
    socket.on('dt:vote_received', onDtVoteReceived);
    socket.on('dt:end', onDtEnd);
    socket.on('dt:restarted', onDtRestarted);

    const onPhotoReused = ({ gameType }) => {
      if (gameType === 'selfie') dispatch({ type: 'SELFIE_MARK_PHOTO_SUBMITTED' });
      else if (gameType === 'caption') dispatch({ type: 'CAPTION_MARK_PHOTO_SUBMITTED' });
      else if (gameType === 'photovote') dispatch({ type: 'PHOTOVOTE_MARK_PHOTO_SUBMITTED' });
      else if (gameType === 'dt') dispatch({ type: 'DT_SELFIE_PHOTO_REUSED' });
    };
    socket.on('player:photo_reused', onPhotoReused);

    const onGlobalScoresUpdated = (data) => {
      dispatch({ type: 'GLOBAL_SCORES_UPDATED', payload: data });
    };
    const onPhaseTimer = (data) => {
      dispatch({ type: 'PHASE_TIMER_TICK', payload: data });
    };
    socket.on('global_scores_updated', onGlobalScoresUpdated);
    socket.on('phase_timer', onPhaseTimer);
    socket.on('game_changed', onGameChanged);

    return () => {
      socket.off('connect', onConnect);
      socket.off('room_created', onRoomCreated);
      socket.off('join_success', onJoinSuccess);
      socket.off('player_joined', onPlayerJoined);
      socket.off('options_updated', onOptionsUpdated);
      socket.off('custom_questions_updated', onCustomQuestionsUpdated);
      socket.off('player_disconnected', onPlayerDisconnected);
      socket.off('host_changed', onHostChanged);
      socket.off('game_started', onGameStarted);
      socket.off('new_question', onNewQuestion);
      socket.off('answer_received', onAnswerReceived);
      socket.off('voting_started', onVotingStarted);
      socket.off('my_answer_index', onMyAnswerIndex);
      socket.off('vote_received', onVoteReceived);
      socket.off('all_votes_in', onAllVotesIn);
      socket.off('answer_revealed', onAnswerRevealed);
      socket.off('next_answer', onNextAnswer);
      socket.off('round_ended', onRoundEnded);
      socket.off('players_ready', onPlayersReady);
      socket.off('game_ended', onGameEnded);
      socket.off('error', onError);
      socket.off('kicked', onKicked);
      socket.off('mlt:prompt', onMltPrompt);
      socket.off('mlt:question_changed', onMltQuestionChanged);
      socket.off('mlt:timer', onMltTimer);
      socket.off('mlt:vote_received', onMltVoteReceived);
      socket.off('mlt:results', onMltResults);
      socket.off('mlt:end', onMltEnd);
      socket.off('mlt:joker_state', onMltJokerState);
      socket.off('mlt:paused', onMltPaused);
      socket.off('mlt:resumed', onMltResumed);
      socket.off('mlt:restarted', onMltRestarted);
      socket.off('tot:vote_received', onTotVoteReceived);
      socket.off('tot:results', onTotResults);
      socket.off('tot:end', onTotEnd);
      socket.off('sit:voting_started', onSitVotingStarted);
      socket.off('sit:vote_received', onSitVoteReceived);
      socket.off('sit:results', onSitResults);
      socket.off('draw:round_start', onDrawRoundStart);
      socket.off('draw:timer', onDrawTimer);
      socket.off('draw:submission_received', onDrawSubmissionReceived);
      socket.off('draw:voting_started', onDrawVotingStarted);
      socket.off('draw:vote_received', onDrawVoteReceived);
      socket.off('draw:results', onDrawResults);
      socket.off('draw:end', onDrawEnd);
      socket.off('draw:restarted', onDrawRestarted);
      socket.off('draw:secret_word', onDrawSecretWord);
      socket.off('draw:word_changed', onDrawWordChanged);
      socket.off('fitb:round_start', onFitbRoundStart);
      socket.off('fitb:answer_received', onFitbAnswerReceived);
      socket.off('fitb:voting_started', onFitbVotingStarted);
      socket.off('fitb:vote_received', onFitbVoteReceived);
      socket.off('fitb:results', onFitbResults);
      socket.off('fitb:end', onFitbEnd);
      socket.off('fitb:restarted', onFitbRestarted);
      socket.off('selfie:photo_phase', onSelfiePhotoPhase);
      socket.off('selfie:photo_received', onSelfiePhotoReceived);
      socket.off('selfie:draw_assigned', onSelfieDrawAssigned);
      socket.off('selfie:drawing_phase', onSelfieDrawingPhase);
      socket.off('selfie:drawing_received', onSelfieDrawingReceived);
      socket.off('selfie:voting_started', onSelfieVotingStarted);
      socket.off('selfie:vote_received', onSelfieVoteReceived);
      socket.off('selfie:results', onSelfieResults);
      socket.off('selfie:restarted', onSelfieRestarted);
      socket.off('selfie:prompt_updated', onSelfiePromptUpdated);
      socket.off('selfie:retake_ready', onSelfieRetakeReady);
      socket.off('caption:photo_phase', onCaptionPhotoPhase);
      socket.off('caption:photo_submitted', onCaptionPhotoSubmitted);
      socket.off('caption:writing_phase', onCaptionWritingPhase);
      socket.off('caption:caption_submitted', onCaptionCaptionSubmitted);
      socket.off('caption:voting_phase', onCaptionVotingPhase);
      socket.off('caption:your_caption_id', onCaptionYourCaptionId);
      socket.off('caption:vote_received', onCaptionVoteReceived);
      socket.off('caption:round_results', onCaptionRoundResults);
      socket.off('caption:game_over', onCaptionGameOver);
      socket.off('caption:restarted', onCaptionRestarted);
      socket.off('photovote:photo_phase', onPhotoVotePhotoPhase);
      socket.off('photovote:photo_submitted', onPhotoVotePhotoSubmitted);
      socket.off('photovote:voting_phase', onPhotoVoteVotingPhase);
      socket.off('photovote:vote_received', onPhotoVoteVoteReceived);
      socket.off('photovote:round_results', onPhotoVoteRoundResults);
      socket.off('photovote:game_over', onPhotoVoteGameOver);
      socket.off('photovote:restarted', onPhotoVoteRestarted);
      socket.off('dt:selfie_phase', onDtSelfiePhase);
      socket.off('dt:photo_received', onDtPhotoReceived);
      socket.off('dt:prompt_phase', onDtPromptPhase);
      socket.off('dt:prompt_received', onDtPromptReceived);
      socket.off('dt:drawing_phase', onDtDrawingPhase);
      socket.off('dt:your_turn', onDtYourTurn);
      socket.off('dt:turn_timer', onDtTurnTimer);
      socket.off('dt:chain_progress', onDtChainProgress);
      socket.off('dt:drawing_progress', onDtDrawingProgress);
      socket.off('dt:guessing_phase', onDtGuessingPhase);
      socket.off('dt:your_guess', onDtYourGuess);
      socket.off('dt:guess_received', onDtGuessReceived);
      socket.off('dt:reveal_phase', onDtRevealPhase);
      socket.off('dt:reveal_update', onDtRevealUpdate);
      socket.off('dt:vote_received', onDtVoteReceived);
      socket.off('dt:end', onDtEnd);
      socket.off('dt:restarted', onDtRestarted);
      socket.off('player:photo_reused', onPhotoReused);
      socket.off('global_scores_updated', onGlobalScoresUpdated);
      socket.off('phase_timer', onPhaseTimer);
      socket.off('game_changed', onGameChanged);
    };
  }, [dispatch, navigate, state.playerId]);
};
