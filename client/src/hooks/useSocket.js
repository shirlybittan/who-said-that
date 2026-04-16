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

    const onRoomCreated = ({ code, playerId, players }) => {
      localStorage.setItem('wst_roomCode', code);
      dispatch({ type: 'SET_ROOM', payload: { roomCode: code, phase: 'lobby', isHost: true, players } });
      dispatch({ type: 'SET_PLAYER_ID', payload: playerId });
      navigate('/lobby');
    };

    const onJoinSuccess = ({ room, playerId }) => {
      localStorage.setItem('wst_roomCode', room.code);
      dispatch({ 
        type: 'SET_ROOM', 
        payload: { 
          roomCode: room.code, 
          phase: room.phase,
          players: room.players,
          mode: room.mode,
          totalRounds: room.totalRounds,
          isHost: room.host === playerId,
          gameType: room.gameType || 'who-said-that',
          mlt: {
            totalRounds: room.mlt?.totalRounds ?? 5,
            allowSelfVote: room.mlt?.allowSelfVote ?? false,
          },
        } 
      });
      dispatch({ type: 'SET_PLAYER_ID', payload: playerId });
      navigate('/lobby');
    };

    const onPlayerJoined = ({ players }) => {
      dispatch({ type: 'UPDATE_PLAYERS', payload: players });
    };

    const onOptionsUpdated = ({ mode, totalRounds, customQuestions, gameType, mltTotalRounds, mltAllowSelfVote }) => {
      dispatch({ type: 'SET_OPTIONS', payload: { mode, totalRounds, customQuestions, gameType, mltTotalRounds, mltAllowSelfVote } });
    };

    const onCustomQuestionsUpdated = ({ customQuestions }) => {
      dispatch({ type: 'UPDATE_CUSTOM_QUESTIONS', payload: customQuestions });
    };

    const onPlayerDisconnected = ({ playerId, playerName }) => {
      // Logic for disconnect goes here if needed
    };

    const onGameStarted = (data) => {
      dispatch({ type: 'SET_GAME_STARTED', payload: data });
      navigate('/question');
    };

    const onNewQuestion = (data) => {
      dispatch({ type: 'SET_QUESTION', payload: data });
    };

    const onAnswerReceived = (data) => {
      dispatch({ type: 'SET_ANSWERED_COUNT', payload: data });
    };

    const onVotingStarted = (data) => {
      dispatch({ type: 'SET_ANSWERS', payload: data });
      navigate('/vote');
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
      dispatch({ type: 'MLT_SET_PROMPT', payload: data });
      navigate('/mlt-vote');
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
    socket.on('mlt:timer', onMltTimer);
    socket.on('mlt:vote_received', onMltVoteReceived);
    socket.on('mlt:results', onMltResults);
    socket.on('mlt:end', onMltEnd);

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
      socket.off('mlt:timer', onMltTimer);
      socket.off('mlt:vote_received', onMltVoteReceived);
      socket.off('mlt:results', onMltResults);
      socket.off('mlt:end', onMltEnd);
    };
  }, [dispatch, navigate, state.playerId]);
};
