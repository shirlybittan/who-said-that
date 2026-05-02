import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { GameProvider, useGame } from './store/gameStore.jsx';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import QuestionPage from './pages/QuestionPage.jsx';
import VotingPage from './pages/VotingPage.jsx';
import RoundEndPage from './pages/RoundEndPage.jsx';
import GameEndPage from './pages/GameEndPage.jsx';
import MostLikelyToVotingPage from './pages/MostLikelyToVotingPage.jsx';
import MostLikelyToResultsPage from './pages/MostLikelyToResultsPage.jsx';
import MostLikelyToEndPage from './pages/MostLikelyToEndPage.jsx';
import ThisOrThatPage from './pages/ThisOrThatPage.jsx';
import ThisOrThatEndPage from './pages/ThisOrThatEndPage.jsx';
import SituationalVotingPage from './pages/SituationalVotingPage.jsx';
import DrawingPage from './pages/DrawingPage.jsx';
import DrawingEndPage from './pages/DrawingEndPage.jsx';
import HostPage from './pages/HostPage.jsx';
import { useSocket } from './hooks/useSocket';

const SocketHandler = ({ children }) => {
  useSocket();
  return <>{children}</>;
};

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
        <Route path="/tot" element={<ThisOrThatPage />} />
        <Route path="/tot-end" element={<ThisOrThatEndPage />} />
        <Route path="/sit-vote" element={<SituationalVotingPage />} />
        <Route path="/draw" element={<DrawingPage />} />
        <Route path="/draw-end" element={<DrawingEndPage />} />
      </Routes>
    </AnimatePresence>
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
          <GameProvider>
            <SocketHandler>
              <div className="font-['Nunito'] min-h-screen bg-[#0D0D1A] text-[#F7F7F7] relative">
                <LangSwitcher />
                <RoomCodeBadge />
                <AnimatedRoutes />
              </div>
            </SocketHandler>
          </GameProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
