import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { motion } from 'framer-motion';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Dashboard() {
  const [sessionName, setSessionName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

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
        
        navigate(`/session/${sessionId}`);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      alert('Failed to create session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 relative z-10">
      {/* Solace Logo - Top Left */}
      <div className="fixed top-4 left-4 z-50">
        <img src="/solace-logo.svg" alt="Solace" className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity" />
      </div>

      <div className="max-w-4xl mx-auto">
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="card"
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
              {loading ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="mt-8 text-center text-gray-300"
        >
          <p className="text-sm drop-shadow-lg flex items-center justify-center gap-2">
            <span>Real-time messaging powered by</span>
            <img src="/solace-logo.svg" alt="Solace" className="h-5" />
          </p>
        </motion.div>
      </div>

      {/* Footer Credit */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 text-[#2DD4BF] text-sm">
        <span>Created by Himanshu Gupta</span>
        <a 
          href="https://www.linkedin.com/in/guptahim/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:opacity-80 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#2DD4BF">
            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}
