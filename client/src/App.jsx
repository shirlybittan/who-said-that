import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import { useSocket } from './hooks/useSocket';

const SocketHandler = ({ children }) => {
  useSocket();
  return <>{children}</>;
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
      <GameProvider>
        <SocketHandler>
          <div className="font-['Nunito'] min-h-screen bg-[#0D0D1A] text-[#F7F7F7] relative">
            <LangSwitcher />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/lobby" element={<LobbyPage />} />
              <Route path="/question" element={<QuestionPage />} />
              <Route path="/vote" element={<VotingPage />} />
              <Route path="/round-end" element={<RoundEndPage />} />
              <Route path="/game-end" element={<GameEndPage />} />
              <Route path="/mlt-vote" element={<MostLikelyToVotingPage />} />
              <Route path="/mlt-results" element={<MostLikelyToResultsPage />} />
              <Route path="/mlt-end" element={<MostLikelyToEndPage />} />
            </Routes>
          </div>
        </SocketHandler>
      </GameProvider>
    </BrowserRouter>
  );
}

export default App;
