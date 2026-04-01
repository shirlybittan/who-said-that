import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GameProvider } from './store/gameStore.jsx';
import HomePage from './pages/HomePage';
import LobbyPage from './pages/LobbyPage';
import QuestionPage from './pages/QuestionPage.jsx';
import VotingPage from './pages/VotingPage.jsx';
import RoundEndPage from './pages/RoundEndPage.jsx';
import GameEndPage from './pages/GameEndPage.jsx';
import { useSocket } from './hooks/useSocket';

const SocketHandler = ({ children }) => {
  useSocket();
  return <>{children}</>;
};

function App() {
  useEffect(() => {
    fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/ping`).catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <GameProvider>
        <SocketHandler>
          <div className="font-['Nunito'] min-h-screen bg-[#0D0D1A] text-[#F7F7F7]">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/lobby" element={<LobbyPage />} />
              <Route path="/question" element={<QuestionPage />} />
              <Route path="/vote" element={<VotingPage />} />
              <Route path="/round-end" element={<RoundEndPage />} />
              <Route path="/game-end" element={<GameEndPage />} />
            </Routes>
          </div>
        </SocketHandler>
      </GameProvider>
    </BrowserRouter>
  );
}

export default App;
