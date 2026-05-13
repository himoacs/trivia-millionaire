import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';
import { getAvatarEmoji, formatMoney } from '@trivia-millionaire/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4847';

interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatar: string;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  totalMoney: number;
}

export default function Leaderboard() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const playerId = localStorage.getItem('playerId') || '';

  useEffect(() => {
    fetchLeaderboard();
  }, [sessionId]);

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/session/${sessionId}/leaderboard`);
      if (response.data.success) {
        setLeaderboard(response.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Solace Logo Banner */}
      <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-3 flex-shrink-0">
        <img src="/solace-logo.svg" alt="Solace" className="h-6 md:h-8 opacity-80 hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex-1 p-4 md:p-6 flex flex-col items-center">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-2xl w-full"
      >
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-6"
        >
          <h1 className="text-4xl md:text-5xl font-black text-white mb-2 flex items-center justify-center gap-3"
              style={{ textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
            <span>🏆</span>
            <span>Leaderboard</span>
            <span>🏆</span>
          </h1>
          <p className="text-gray-400">{leaderboard.length} players</p>
        </motion.div>

        {/* Back Button */}
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => navigate(`/results/${sessionId}`)}
          className="mb-4 flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
        >
          <span>←</span>
          <span>Back to Results</span>
        </motion.button>

        {/* Leaderboard */}
        {loading ? (
          <div className="text-center py-12">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
              className="text-4xl inline-block"
            >
              ⏳
            </motion.div>
            <p className="text-gray-400 mt-4">Loading leaderboard...</p>
          </div>
        ) : (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="bg-gradient-to-br from-millionaire-navy/80 to-millionaire-navy-dark/80 backdrop-blur-sm rounded-2xl p-4 md:p-6 border border-orange-500/50"
          >
            {/* Top 3 Podium */}
            {leaderboard.length >= 3 && (
              <div className="flex justify-center items-end gap-2 md:gap-4 mb-8 pt-4">
                {/* 2nd Place */}
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-2">{getAvatarEmoji(leaderboard[1].avatar)}</div>
                  <div className="text-sm font-bold text-gray-200 truncate max-w-[70px] sm:max-w-[100px] text-center">
                    {leaderboard[1].name}
                  </div>
                  <div className="text-xs text-orange-400 font-bold">
                    {formatMoney(leaderboard[1].totalMoney)}
                  </div>
                  <div className="w-20 h-16 bg-gradient-to-t from-gray-400 to-gray-300 rounded-t-lg mt-2 flex items-center justify-center">
                    <span className="text-3xl">🥈</span>
                  </div>
                </motion.div>

                {/* 1st Place */}
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-5xl mb-2">{getAvatarEmoji(leaderboard[0].avatar)}</div>
                  <div className="text-sm font-bold text-white truncate max-w-[70px] sm:max-w-[100px] text-center">
                    {leaderboard[0].name}
                  </div>
                  <div className="text-xs text-orange-400 font-bold">
                    {formatMoney(leaderboard[0].totalMoney)}
                  </div>
                  <div className="w-24 h-24 bg-gradient-to-t from-yellow-500 to-yellow-400 rounded-t-lg mt-2 flex items-center justify-center shadow-[0_0_30px_rgba(255,200,0,0.5)]">
                    <span className="text-4xl">🥇</span>
                  </div>
                </motion.div>

                {/* 3rd Place */}
                <motion.div
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex flex-col items-center"
                >
                  <div className="text-4xl mb-2">{getAvatarEmoji(leaderboard[2].avatar)}</div>
                  <div className="text-sm font-bold text-gray-200 truncate max-w-[70px] sm:max-w-[100px] text-center">
                    {leaderboard[2].name}
                  </div>
                  <div className="text-xs text-orange-400 font-bold">
                    {formatMoney(leaderboard[2].totalMoney)}
                  </div>
                  <div className="w-20 h-12 bg-gradient-to-t from-amber-700 to-amber-600 rounded-t-lg mt-2 flex items-center justify-center">
                    <span className="text-3xl">🥉</span>
                  </div>
                </motion.div>
              </div>
            )}

            {/* Full List */}
            <div className="space-y-2">
              {leaderboard.map((entry, index) => {
                const isMe = entry.playerId === playerId;
                const rankDisplay = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}`;
                const accuracy = entry.totalAnswers > 0 
                  ? Math.round((entry.correctAnswers / entry.totalAnswers) * 100) 
                  : 0;
                
                return (
                  <motion.div
                    key={entry.playerId}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.03 }}
                    className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                      isMe 
                        ? 'bg-gradient-to-r from-orange-500/90 to-amber-500/90 ring-2 ring-orange-300' 
                        : 'bg-millionaire-navy-dark/50 hover:bg-millionaire-navy/50'
                    }`}
                  >
                    <div className={`w-10 text-center font-bold ${index < 3 ? 'text-xl' : 'text-sm text-gray-400'}`}>
                      {rankDisplay}
                    </div>
                    <div className="text-2xl">{getAvatarEmoji(entry.avatar)}</div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold truncate ${isMe ? 'text-white' : 'text-gray-200'}`}>
                        {entry.name} {isMe && <span className="text-xs opacity-80">(You)</span>}
                      </div>
                      <div className={`text-xs ${isMe ? 'text-white/70' : 'text-gray-500'}`}>
                        {entry.correctAnswers}/{entry.totalAnswers} correct • {accuracy}% accuracy
                      </div>
                    </div>
                    <div className={`font-black text-lg ${isMe ? 'text-white' : 'text-orange-400'}`}>
                      {formatMoney(entry.totalMoney)}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        <div className="flex items-center justify-center gap-2 mt-6 text-sm text-gray-500">
          <span>Powered by</span>
          <img src="/solace-logo.svg" alt="Solace" className="h-5" />
        </div>
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
