import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SessionView from './pages/SessionView';
import PresenterView from './pages/PresenterView';

function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/session/:sessionId" element={<SessionView />} />
        <Route path="/presenter/:sessionId" element={<PresenterView />} />
      </Routes>
    </div>
  );
}

export default App;
