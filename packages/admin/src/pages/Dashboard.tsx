import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import SolaceStatusIndicator from '../components/SolaceStatusIndicator';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4847';

interface SessionInfo {
  id: string;
  code: string;
  name: string;
  state: 'LOBBY' | 'ACTIVE' | 'CLOSED';
  playerCount: number;
  questionCount: number;
  currentQuestionIndex: number;
  createdAt: number;
}

export default function Dashboard() {
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const navigate = useNavigate();

  // Fetch all sessions on mount
  useEffect(() => {
    loadSessions();
    // Refresh sessions every 5 seconds
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/sessions`);
      if (response.data.success) {
        setSessions(response.data.data.sessions);
      }
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleCreateSession = async () => {
    if (!sessionName.trim()) return;

    setLoading(true);
    try {
      const response = await axios.post(`${API_URL}/api/admin/session`, {
        name: sessionName
      });

      if (response.data.success) {
        const { sessionId, code, name } = response.data.data;
        
        // Store session info in localStorage for SessionView to use
        localStorage.setItem(`session_${sessionId}_code`, code);
        localStorage.setItem(`session_${sessionId}_name`, name);
        
        // Refresh sessions list
        loadSessions();
        
        navigate(`/session/${sessionId}`);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  const handleRejoinSession = (session: SessionInfo) => {
    // Store session info in localStorage
    localStorage.setItem(`session_${session.id}_code`, session.code);
    localStorage.setItem(`session_${session.id}_name`, session.name);
    
    navigate(`/session/${session.id}`);
  };

  const handleDeleteSession = async (session: SessionInfo, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    const confirmed = window.confirm(
      `Delete session "${session.name}" (${session.code})?\n\nThis will permanently remove all questions, rounds, and player data.`
    );
    
    if (!confirmed) return;
    
    try {
      const response = await axios.delete(`${API_URL}/api/admin/session/${session.id}`);
      if (response.data.success) {
        // Remove from local storage
        localStorage.removeItem(`session_${session.id}_code`);
        localStorage.removeItem(`session_${session.id}_name`);
        // Refresh sessions list
        loadSessions();
      }
    } catch (error) {
      console.error('Failed to delete session:', error);
      alert('Failed to delete session');
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'LOBBY': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'ACTIVE': return 'bg-green-500/20 text-green-300 border-green-500/50';
      case 'CLOSED': return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
      default: return 'bg-gray-500/20 text-gray-300 border-gray-500/50';
    }
  };

  const getStateIcon = (state: string) => {
    switch (state) {
      case 'LOBBY': return '📋';
      case 'ACTIVE': return '🎮';
      case 'CLOSED': return '🏁';
      default: return '📋';
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen relative pb-20">
      {/* Top Banner */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-b from-black/80 via-black/50 to-transparent backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          {/* Solace Logo - Left */}
          <img src="/solace-logo.svg" alt="Solace" className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity" />
          
          {/* Solace Connection Status - Right */}
          <SolaceStatusIndicator />
        </div>
      </div>

      <div className="pt-24 p-8 relative z-10">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <h1 className="text-5xl font-bold text-white mb-2 drop-shadow-lg">
              Admin Dashboard
            </h1>
            <p className="text-millionaire-gold text-lg drop-shadow-lg">Create and manage trivia sessions</p>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Create New Session - Left Column */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 }}
              className="card lg:col-span-1"
            >
              <h2 className="text-2xl font-bold text-white mb-6 drop-shadow-lg">
                Create New Session
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-millionaire-gold mb-2">
                    Session Name
                  </label>
                  <input
                    type="text"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="input-field"
                    placeholder="e.g., Friday Trivia Night"
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateSession()}
                  />
                </div>

                <button
                  onClick={handleCreateSession}
                  disabled={loading || !sessionName.trim()}
                  className="btn-primary w-full"
                >
                  {loading ? 'Creating...' : '+ Create Session'}
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-millionaire-gold/20">
                <p className="text-sm text-gray-400 flex items-center justify-center gap-2">
                  <span>Real-time via</span>
                  <img src="/solace-logo.svg" alt="Solace" className="h-4" />
                </p>
              </div>
            </motion.div>

            {/* Existing Sessions - Right Column */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-2"
            >
              <div className="card">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                    All Sessions
                  </h2>
                  <button
                    onClick={loadSessions}
                    className="btn-tertiary btn-sm"
                    disabled={loadingSessions}
                    title="Refresh sessions list"
                  >
                    {loadingSessions ? '↻' : '🔄'} Refresh
                  </button>
                </div>

                {loadingSessions && sessions.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="animate-spin text-4xl mb-4">⏳</div>
                    <p>Loading sessions...</p>
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="text-6xl mb-4">🎮</div>
                    <p className="text-lg">No sessions yet</p>
                    <p className="text-sm mt-2">Create your first trivia session to get started!</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                    <AnimatePresence>
                      {sessions.map((session, index) => (
                        <motion.div
                          key={session.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -20 }}
                          transition={{ delay: index * 0.05 }}
                          className="bg-gradient-to-r from-millionaire-purple/30 to-millionaire-dark/30 border border-millionaire-gold/20 rounded-lg p-4 hover:border-millionaire-gold/40 transition-all"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h3 className="text-lg font-bold text-white truncate">
                                  {session.name}
                                </h3>
                                <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getStateColor(session.state)}`}>
                                  {getStateIcon(session.state)} {session.state}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-gray-300">
                                <div>
                                  <span className="text-gray-400">Code:</span>{' '}
                                  <span className="font-mono font-semibold text-millionaire-gold">{session.code}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Players:</span>{' '}
                                  <span className="font-semibold">👥 {session.playerCount}</span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Questions:</span>{' '}
                                  <span className="font-semibold">
                                    {session.currentQuestionIndex >= 0 
                                      ? `${session.currentQuestionIndex + 1}/${session.questionCount}`
                                      : session.questionCount}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-400">Created:</span>{' '}
                                  <span className="font-semibold">{formatDate(session.createdAt)}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleRejoinSession(session)}
                                className="btn-secondary whitespace-nowrap"
                                title={session.state === 'CLOSED' ? 'View session results' : 'Open session'}
                              >
                                {session.state === 'CLOSED' ? '📊 View' : '▶️ Open'}
                              </button>
                              <button
                                onClick={(e) => handleDeleteSession(session, e)}
                                className="btn-icon-danger btn-icon-sm"
                                title="Delete session"
                                aria-label="Delete session"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer Credit Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-millionaire-navy-dark/90 backdrop-blur-sm border-t border-millionaire-gold/20">
        <div className="flex items-center justify-end gap-2 py-2 pr-4 text-[#2DD4BF] text-sm">
          <span>Created by Himanshu Gupta</span>
          <a 
            href="https://www.linkedin.com/in/guptahim/" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:opacity-80 transition-opacity"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#2DD4BF">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
