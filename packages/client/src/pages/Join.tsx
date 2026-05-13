import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import type { PlayerAvatar } from '@trivia-millionaire/shared';
import { AVATAR_EMOJIS } from '@trivia-millionaire/shared';
import { useSound } from '../utils/sound';
import SoundToggle from '../components/SoundToggle';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4847';

const AVATARS: { emoji: string; name: PlayerAvatar }[] = Object.entries(AVATAR_EMOJIS).map(
  ([name, emoji]) => ({ emoji, name: name as PlayerAvatar })
);

export default function Join() {
  const { sessionCode } = useParams<{ sessionCode: string }>();
  const [nickname, setNickname] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<PlayerAvatar>('robot');
  const [sessionName, setSessionName] = useState('');
  const [sessionState, setSessionState] = useState<'LOBBY' | 'ACTIVE' | 'PAUSED' | 'CLOSED'>('LOBBY');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  
  // Sound effects
  const { play: playSound } = useSound();

  useEffect(() => {
    loadSessionInfo();
  }, [sessionCode]);

  const loadSessionInfo = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/session/${sessionCode}/info`);
      if (response.data.success) {
        setSessionName(response.data.data.name);
        setSessionState(response.data.data.state || 'LOBBY');
        if (response.data.data.state === 'CLOSED') {
          setError('This game has ended');
        }
      }
    } catch (err) {
      setError('Session not found');
    }
  };

  const handleJoin = async () => {
    if (!nickname.trim()) return;

    setLoading(true);
    setError('');

    try {
      // Play join sound
      playSound('join');
      
      const response = await axios.post(`${API_URL}/api/session/${sessionCode}/join`, {
        nickname: nickname.trim(),
        avatar: selectedAvatar
      });

      if (response.data.success) {
        const { sessionId, playerId, reconnectToken } = response.data.data;
        localStorage.setItem('playerId', playerId);
        localStorage.setItem('nickname', nickname);
        localStorage.setItem('avatar', selectedAvatar);
        // Store reconnect token for session persistence
        if (reconnectToken) {
          localStorage.setItem('reconnectToken', reconnectToken);
          localStorage.setItem('reconnectSessionId', sessionId);
        }
        navigate(`/game/${sessionId}`);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to join session');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Sound Toggle */}
      <SoundToggle />
      
      {/* Solace Logo Banner */}
      <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-3 flex-shrink-0">
        <img src="/solace-logo.svg" alt="Solace" className="h-6 md:h-8 opacity-80 hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex-1 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-3xl shadow-[0_0_30px_rgba(255,149,0,0.4)] p-8 max-w-md w-full border-2 border-orange-500"
      >
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white mb-2 drop-shadow-lg">
            {sessionName || 'Loading...'}
          </h1>
          <p className="text-orange-400 drop-shadow-lg">Game Code: <span className="font-mono font-bold">{sessionCode}</span></p>
          
          {sessionState === 'ACTIVE' && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 inline-flex items-center gap-2 bg-amber-500/20 border border-amber-500 text-amber-400 px-4 py-2 rounded-full text-sm font-semibold"
            >
              <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse"></span>
              Game in progress - You can still join!
            </motion.div>
          )}
        </div>

        {/* Nickname */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-orange-400 mb-2">
            Choose Your Nickname
          </label>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            className="w-full px-4 py-3 border-2 border-orange-500 bg-gray-900 text-white rounded-xl focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-400 text-lg placeholder-gray-500"
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />
        </div>

        {/* Avatar Selection */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-orange-400 mb-3">
            Pick Your Avatar
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
            {AVATARS.map((avatar) => (
              <motion.button
                key={avatar.name}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedAvatar(avatar.name)}
                className={`text-5xl p-4 rounded-xl transition-all ${
                  selectedAvatar === avatar.name
                    ? 'bg-gradient-to-br from-orange-500 to-amber-500 shadow-[0_0_25px_rgba(255,149,0,0.6)] ring-4 ring-orange-400'
                    : 'bg-gray-900 hover:bg-millionaire-navy border border-orange-500/30'
                }`}
              >
                {avatar.emoji}
              </motion.button>
            ))}
          </div>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-xl mb-4 text-center"
          >
            {error}
          </motion.div>
        )}

        <button
          onClick={handleJoin}
          disabled={loading || !nickname.trim() || sessionState === 'CLOSED'}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-xl text-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(255,149,0,0.5)]"
        >
          {loading ? (
            <span className="flex items-center justify-center">
              <svg className="animate-spin h-6 w-6 mr-2" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Joining...
            </span>
          ) : (
            "Let's Play! 🎉"
          )}
        </button>
      </motion.div>
      </div>

      {/* Footer Credit */}
      <div className="fixed bottom-safe right-4 z-50 flex items-center gap-2 text-[#2DD4BF] text-sm">
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
