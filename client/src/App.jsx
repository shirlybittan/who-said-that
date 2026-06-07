import React, { useEffect, useState, Component } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { GameProvider, useGame } from './store/gameStore.jsx';
import TimerRing from './components/game/TimerRing';
import { soundManager } from './sounds/SoundManager';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import QuestionPage from './pages/QuestionPage.jsx';
import VotingPage from './pages/VotingPage.jsx';
import RoundEndPage from './pages/RoundEndPage.jsx';
import GameEndPage from './pages/GameEndPage.jsx';
import MostLikelyToVotingPage from './pages/MostLikelyToVotingPage.jsx';
import MostLikelyToResultsPage from './pages/MostLikelyToResultsPage.jsx';
import MostLikelyToEndPage from './pages/MostLikelyToEndPage.jsx';
import ThisOrThatPlayerView from './games/this-or-that/PlayerView.jsx';
import ThisOrThatEndPage from './pages/ThisOrThatEndPage.jsx';
import SituationalVotingPage from './pages/SituationalVotingPage.jsx';
import DrawingPage from './pages/DrawingPage.jsx';
import DrawingEndPage from './pages/DrawingEndPage.jsx';
import FillBlankPage from './pages/FillBlankPage.jsx';
import FillBlankEndPage from './pages/FillBlankEndPage.jsx';
import SelfiePhotoPage from './pages/SelfiePhotoPage.jsx';
import SelfieDrawPage from './pages/SelfieDrawPage.jsx';
import SelfieVotePage from './pages/SelfieVotePage.jsx';
import SelfieResultsPage from './pages/SelfieResultsPage.jsx';
import CaptionPhotoPage from './pages/CaptionPhotoPage.jsx';
import CaptionWritePage from './pages/CaptionWritePage.jsx';
import CaptionVotePage from './pages/CaptionVotePage.jsx';
import CaptionResultsPage from './pages/CaptionResultsPage.jsx';
import PhotoVotePhotoPage from './pages/PhotoVotePhotoPage.jsx';
import PhotoVotePage from './pages/PhotoVotePage.jsx';
import PhotoVoteResultsPage from './pages/PhotoVoteResultsPage.jsx';
import DrawTelPromptPage from './pages/DrawTelPromptPage.jsx';
import DrawTelDrawPage from './pages/DrawTelDrawPage.jsx';
import DrawTelGuessPage from './pages/DrawTelGuessPage.jsx';
import DrawTelRevealPage from './pages/DrawTelRevealPage.jsx';
import DrawTelEndPage from './pages/DrawTelEndPage.jsx';
import DrawTelWaitPage from './pages/DrawTelWaitPage.jsx';
import HostPage from './pages/HostPage.jsx';
import { useSocket } from './hooks/useSocket';

const SocketHandler = ({ children }) => {
  useSocket();
  return <>{children}</>;
};

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0D0D1A] text-[#F7F7F7] p-8 text-center">
          <p className="text-4xl mb-4">😵</p>
          <h1 className="text-2xl font-['Fredoka_One'] text-[#FFE66D] mb-2">Something went wrong</h1>
          <p className="text-sm text-gray-400 mb-6 font-['Nunito']">
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() => window.location.replace('/')}
            className="bg-[#4ECDC4] text-black font-bold px-6 py-3 rounded-xl text-lg font-['Fredoka_One'] hover:bg-[#FFE66D] transition"
          >
            Return Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<HomePage />} />
        <Route path="/lobby" element={<LobbyPage />} />
        <Route path="/question" element={<QuestionPage />} />
        <Route path="/vote" element={<VotingPage />} />
        <Route path="/round-end" element={<RoundEndPage />} />
        <Route path="/game-end" element={<GameEndPage />} />
        <Route path="/mlt-vote" element={<MostLikelyToVotingPage />} />
        <Route path="/mlt-results" element={<MostLikelyToResultsPage />} />
        <Route path="/mlt-end" element={<MostLikelyToEndPage />} />
        <Route path="/tot" element={<ThisOrThatPlayerView />} />
        <Route path="/tot-end" element={<ThisOrThatEndPage />} />
        <Route path="/sit-vote" element={<SituationalVotingPage />} />
        <Route path="/draw" element={<DrawingPage />} />
        <Route path="/draw-end" element={<DrawingEndPage />} />
        <Route path="/fitb" element={<FillBlankPage />} />
        <Route path="/fitb-end" element={<FillBlankEndPage />} />
        <Route path="/selfie-photo" element={<SelfiePhotoPage />} />
        <Route path="/selfie-draw" element={<SelfieDrawPage />} />
        <Route path="/selfie-vote" element={<SelfieVotePage />} />
        <Route path="/selfie-results" element={<SelfieResultsPage />} />
        <Route path="/caption-photo" element={<CaptionPhotoPage />} />
        <Route path="/caption-write" element={<CaptionWritePage />} />
        <Route path="/caption-vote" element={<CaptionVotePage />} />
        <Route path="/caption-results" element={<CaptionResultsPage />} />
        <Route path="/photo-vote-photo" element={<PhotoVotePhotoPage />} />
        <Route path="/photo-vote" element={<PhotoVotePage />} />
        <Route path="/photo-vote-results" element={<PhotoVoteResultsPage />} />
        <Route path="/draw-tel-prompt" element={<DrawTelPromptPage />} />
        <Route path="/draw-tel-draw" element={<DrawTelDrawPage />} />
        <Route path="/draw-tel-guess" element={<DrawTelGuessPage />} />
        <Route path="/draw-tel-reveal" element={<DrawTelRevealPage />} />
        <Route path="/draw-tel-end" element={<DrawTelEndPage />} />
        <Route path="/draw-tel-wait" element={<DrawTelWaitPage />} />
      </Routes>
    </AnimatePresence>
  );
};

const GlobalTimerOverlay = () => {
  const { state } = useGame();
  const timer = state.phaseTimer;
  // Hide timer in lobby, home, or end screens — it's only relevant during active gameplay
  const hiddenPhases = ['lobby', 'home', 'game_end', 'gameEnd', 'dt', 'drawing', 'selfie', 'mlt', 'fitb', 'caption', 'selfie-roast'];
  if (!timer?.active || timer.secondsLeft <= 0 || hiddenPhases.includes(state.phase)) return null;
  const total = state.roomConfig?.roundDurationSecs || 60;
  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <TimerRing secondsLeft={timer.secondsLeft} total={total} size={64} />
    </div>
  );
};

const RoomCodeBadge = () => {
  const { state } = useGame();
  if (!state.roomCode || !state.phase || state.phase === 'game_end') return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 bg-[#1A1A2E]/90 backdrop-blur-sm border border-[#2D2D44] rounded-xl px-3 py-2 text-center shadow-lg pointer-events-none">
      <p className="text-[10px] font-['Nunito'] text-gray-500 uppercase tracking-widest leading-none mb-0.5">Room</p>
      <p className="text-lg font-['Fredoka_One'] text-[#FFE66D] tracking-widest leading-tight">{state.roomCode}</p>
    </div>
  );
};

const SoundToggle = () => {
  const [muted, setMuted] = useState(() => soundManager.muted);
  const handleToggle = () => {
    const nowMuted = soundManager.toggleMute();
    setMuted(nowMuted);
    if (!nowMuted) soundManager.playClick();
  };
  return (
    <button
      onClick={handleToggle}
      title={muted ? 'Unmute sounds' : 'Mute sounds'}
      className="absolute top-4 right-20 bg-[#2D2D44] text-white px-3 py-1 rounded-full text-sm font-bold z-50 border border-gray-600 hover:bg-[#4ECDC4] hover:text-black transition"
      aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
};

const LangSwitcher = () => {
  const { state, dispatch } = useGame();
  const toggleLanguage = () => {
    const newLang = state.lang === 'en' ? 'fr' : 'en';
    dispatch({ type: 'SET_LANG', payload: newLang });
  };

  return (
    <button 
      onClick={toggleLanguage} 
      className="absolute top-4 right-4 bg-[#2D2D44] text-white px-3 py-1 rounded-full text-sm font-bold z-50 border border-gray-600 hover:bg-[#FFE66D] hover:text-black transition"
    >
      {state.lang === 'en' ? 'FR 🇫🇷' : 'EN 🇬🇧'}
    </button>
  );
};

function App() {
  useEffect(() => {
    fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/ping`).catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        {/* Host / TV screen — manages its own socket, lives outside GameProvider */}
        <Route path="/host" element={<HostPage />} />

        {/* Player / phone routes */}
        <Route path="/*" element={
          <ErrorBoundary>
            <GameProvider>
              <SocketHandler>
                <div className="font-['Nunito'] min-h-screen bg-[#0D0D1A] text-[#F7F7F7] relative">
                  <SoundToggle />
                  <LangSwitcher />
                  <RoomCodeBadge />
                  <GlobalTimerOverlay />
                  <AnimatedRoutes />
                </div>
              </SocketHandler>
            </GameProvider>
          </ErrorBoundary>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
