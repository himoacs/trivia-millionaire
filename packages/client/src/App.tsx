import { Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Join from './pages/Join';
import Game from './pages/Game';
import Results from './pages/Results';
import Leaderboard from './pages/Leaderboard';

function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/join/:sessionCode" element={<Join />} />
        <Route path="/game/:sessionId" element={<Game />} />
        <Route path="/results/:sessionId" element={<Results />} />
        <Route path="/leaderboard/:sessionId" element={<Leaderboard />} />
      </Routes>
    </div>
  );
}

export default App;
