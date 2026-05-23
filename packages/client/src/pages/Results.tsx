import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { toPng } from 'html-to-image';
import axios from 'axios';
import { getAvatarEmoji, formatMoney } from '@trivia-millionaire/shared';
import { useSound } from '../utils/sound';
import SoundToggle from '../components/SoundToggle';

const API_URL = import.meta.env.VITE_API_URL ?? '';

interface LeaderboardEntry {
  playerId: string;
  name: string;
  avatar: string;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  totalMoney: number;
}

export default function Results() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState(0);
  const [myCorrectAnswers, setMyCorrectAnswers] = useState(0);
  const [myTotalAnswers, setMyTotalAnswers] = useState(0);
  const [myTotalMoney, setMyTotalMoney] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const scoreCardRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const playerId = localStorage.getItem('playerId') || '';
  const nickname = localStorage.getItem('nickname') || 'Player';
  const avatarName = localStorage.getItem('avatar') || 'robot';
  const avatar = getAvatarEmoji(avatarName);
  
  // Sound effects
  const { play: playSound } = useSound();

  useEffect(() => {
    fetchLeaderboard();
    
    // Play leaderboard reveal sound
    playSound('leaderboard');
  }, [sessionId]);

  const fetchLeaderboard = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/session/${sessionId}/leaderboard`);
      
      if (response.data.success) {
        const data: LeaderboardEntry[] = response.data.data;
        setLeaderboard(data);
        setTotalPlayers(data.length);
        
        // Find player's rank and score
        const playerIndex = data.findIndex(entry => entry.playerId === playerId);
        if (playerIndex !== -1) {
          setMyRank(playerIndex + 1);
          setMyCorrectAnswers(data[playerIndex].correctAnswers);
          setMyTotalAnswers(data[playerIndex].totalAnswers);
          setMyTotalMoney(data[playerIndex].totalMoney);
          
          // Celebrate if top 3
          if (playerIndex < 3) {
            celebrateTopScore();
          }
        }
      }
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
    }
  };

  const celebrateTopScore = () => {
    const duration = 3000;
    const animationEnd = Date.now() + duration;

    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };

    const interval = setInterval(() => {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        clearInterval(interval);
        return;
      }

      confetti({
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 0,
        particleCount: 50,
        origin: {
          x: randomInRange(0.1, 0.9),
          y: Math.random() - 0.2
        },
        colors: ['#F7941D', '#FFB81C', '#0052A3', '#0D1B2A', '#FF6B35']
      });
    }, 250);
  };

  const handleDownloadScoreCard = async () => {
    if (!scoreCardRef.current) return;

    try {
      const dataUrl = await toPng(scoreCardRef.current, {
        quality: 1.0,
        pixelRatio: 2,
      });

      const link = document.createElement('a');
      link.download = `trivia-score-${nickname}-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to download scorecard:', error);
    }
  };

  const handleShareLinkedIn = () => {
    const url = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.origin)}`;
    window.open(url, '_blank');
    alert(`Share your ${formatMoney(myTotalMoney)} winnings! Remember to upload your downloaded scorecard image to your LinkedIn post!`);
  };

  const handlePlayAgain = () => {
    navigate('/');
  };

  const accuracy = myTotalAnswers > 0 ? Math.round((myCorrectAnswers / myTotalAnswers) * 100) : 0;

  return (
    <div className="min-h-screen flex flex-col relative z-10 overflow-x-hidden">
      {/* Sound Toggle */}
      <SoundToggle />
      
      {/* Solace Logo Banner */}
      <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-3 flex-shrink-0">
        <img src="/solace-logo.svg" alt="Solace" className="h-8" />
      </div>
      
      <div className="flex-1 p-4 md:p-6 flex flex-col items-center">
      {/* Hidden Scorecard for Download */}
      <div className="fixed -left-[9999px] -top-[9999px]">
        <div
          ref={scoreCardRef}
          className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark"
          style={{ width: '1200px', height: '630px' }}
        >
          <div className="flex flex-col h-full p-12 border-8 border-orange-500 rounded-3xl">
            <div className="text-center mb-4">
              <h2 className="text-5xl font-black mb-1 bg-gradient-to-r from-orange-400 to-amber-500 text-transparent bg-clip-text">
                Trivia Millionaire
              </h2>
              <p className="text-2xl text-white font-bold">Final Winnings</p>
            </div>
            <div className="text-center flex-1 flex flex-col items-center justify-center">
              <div className="text-7xl mb-3">{avatar}</div>
              <h3 className="text-4xl font-black text-white mb-4">{nickname}</h3>
              <div className="text-8xl font-black mb-6 bg-gradient-to-br from-orange-400 via-amber-400 to-orange-500 text-transparent bg-clip-text">
                {formatMoney(myTotalMoney)}
              </div>
              <div className="flex space-x-16 text-center">
                <div>
                  <div className="text-5xl font-black text-white">#{myRank}</div>
                  <div className="text-xl text-orange-400 font-bold mt-1">Rank</div>
                </div>
                <div>
                  <div className="text-5xl font-black text-white">{accuracy}%</div>
                  <div className="text-xl text-orange-400 font-bold mt-1">Accuracy</div>
                </div>
                <div>
                  <div className="text-5xl font-black text-white">{myCorrectAnswers}/{myTotalAnswers}</div>
                  <div className="text-xl text-orange-400 font-bold mt-1">Correct</div>
                </div>
              </div>
            </div>
            <div className="text-center border-t-4 border-orange-500 pt-4 flex items-center justify-center gap-3">
              <span className="text-xl text-gray-300">Powered by</span>
              <img src="/solace-logo.svg" alt="Solace" className="h-8" />
            </div>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="max-w-lg w-full"
      >
        {/* Trophy & Congratulations */}
        <motion.div
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="text-center mb-6"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-7xl md:text-8xl mb-4"
            style={{ filter: 'drop-shadow(0 0 30px rgba(255,165,0,0.8))' }}
          >
            {myRank === 1 ? '🏆' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : '🎉'}
          </motion.div>
          
          <h1 className="text-4xl md:text-5xl font-black text-white mb-2"
              style={{ textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
            {myRank <= 3 ? 'Congratulations!' : 'Great Game!'}
          </h1>

          <p className="text-lg text-gray-300 mb-4">
            You placed <span className="text-orange-400 font-black text-2xl">#{myRank}</span> of {totalPlayers} players
          </p>

          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="inline-block"
          >
            <div className="text-sm text-orange-400 font-bold uppercase tracking-wider mb-1">Total Winnings</div>
            <div className="text-5xl md:text-6xl font-black bg-gradient-to-r from-orange-400 via-amber-400 to-orange-500 text-transparent bg-clip-text"
                 style={{ filter: 'drop-shadow(0 0 20px rgba(255,165,0,0.7))' }}>
              {formatMoney(myTotalMoney)}
            </div>
          </motion.div>
        </motion.div>

        {/* Stats Summary */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-millionaire-navy/80 to-millionaire-navy-dark/80 backdrop-blur-sm rounded-2xl p-6 mb-6 border border-orange-500/50"
        >
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="text-5xl">{avatar}</div>
            <div>
              <div className="text-xl font-bold text-white">{nickname}</div>
              <div className="text-sm text-orange-400">Trivia Champion</div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-millionaire-navy-dark/60 rounded-xl p-3">
              <div className="text-2xl md:text-3xl font-black text-white">#{myRank}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Rank</div>
            </div>
            <div className="bg-millionaire-navy-dark/60 rounded-xl p-3">
              <div className="text-2xl md:text-3xl font-black text-white">{accuracy}%</div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Accuracy</div>
            </div>
            <div className="bg-millionaire-navy-dark/60 rounded-xl p-3">
              <div className="text-2xl md:text-3xl font-black text-white">{myCorrectAnswers}/{myTotalAnswers}</div>
              <div className="text-xs text-gray-400 uppercase tracking-wide">Correct</div>
            </div>
          </div>
        </motion.div>

        {/* Action Buttons - 2x2 Grid */}
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="grid grid-cols-2 gap-2 mb-6"
        >
          <button
            onClick={handleDownloadScoreCard}
            className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-semibold py-2.5 px-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 text-sm"
          >
            <span>📥</span>
            <span>Download</span>
          </button>

          <button
            onClick={handleShareLinkedIn}
            className="bg-gradient-to-r from-[#0077B5] to-[#005885] hover:from-[#0088CC] hover:to-[#006699] text-white font-semibold py-2.5 px-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 text-sm"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
            <span>LinkedIn</span>
          </button>

          <button
            onClick={() => navigate(`/leaderboard/${sessionId}`)}
            className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 text-white font-semibold py-2.5 px-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 text-sm"
          >
            <span>🏆</span>
            <span>Leaderboard</span>
          </button>

          <button
            onClick={handlePlayAgain}
            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-semibold py-2.5 px-3 rounded-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-1.5 text-sm shadow-[0_0_15px_rgba(255,165,0,0.3)]"
          >
            <span>🔄</span>
            <span>Play Again</span>
          </button>
        </motion.div>

        {/* Top 3 Preview */}
        {leaderboard.length > 0 && (
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-millionaire-navy/60 to-millionaire-navy-dark/60 backdrop-blur-sm rounded-xl p-4 border border-orange-500/30"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-300">Top Players</h2>
              <button 
                onClick={() => navigate(`/leaderboard/${sessionId}`)}
                className="text-xs text-orange-400 hover:text-orange-300 transition-colors"
              >
                View All →
              </button>
            </div>
            
            <div className="space-y-2">
              {leaderboard.slice(0, 3).map((entry, index) => {
                const isMe = entry.playerId === playerId;
                const rankDisplay = index === 0 ? '🥇' : index === 1 ? '🥈' : '🥉';
                
                return (
                  <div
                    key={entry.playerId}
                    className={`flex items-center gap-2 p-2 rounded-lg ${
                      isMe 
                        ? 'bg-orange-500/20 ring-1 ring-orange-400/50' 
                        : 'bg-millionaire-navy-dark/40'
                    }`}
                  >
                    <span className="text-lg">{rankDisplay}</span>
                    <span className="text-xl">{getAvatarEmoji(entry.avatar)}</span>
                    <span className={`flex-1 text-sm font-medium truncate ${isMe ? 'text-orange-300' : 'text-gray-300'}`}>
                      {entry.name} {isMe && '(You)'}
                    </span>
                    <span className={`text-sm font-bold ${isMe ? 'text-orange-400' : 'text-orange-400/80'}`}>
                      {formatMoney(entry.totalMoney)}
                    </span>
                  </div>
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

      {/* Footer Credit Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[#0D1B2A]/95 backdrop-blur-sm border-t border-orange-500/30">
        <div className="px-6 py-3 flex items-center justify-end gap-2 text-[#2DD4BF] text-sm">
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
