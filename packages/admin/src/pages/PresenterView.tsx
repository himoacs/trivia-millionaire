import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { QuestionMessage, Player, RoundStartedMessage, RoundEndedMessage, LeaderboardEntry as SharedLeaderboardEntry } from '@trivia-millionaire/shared';
import { getAvatarEmoji, formatMoney as formatMoneyShared } from '@trivia-millionaire/shared';
import { useSolace } from '../hooks/useSolace';
import SolaceStatusIndicator from '../components/SolaceStatusIndicator';
import SolaceDebugPanel from '../components/SolaceDebugPanel';
import AnswerDistributionChart from '../components/AnswerDistributionChart';
import { MoneyLadder, MONEY_LADDER, formatMoney } from '../components/MoneyLadder';
import { usePresenterSound } from '../utils/presenterSound';
import PresenterSoundToggle from '../components/PresenterSoundToggle';

// Local leaderboard entry (API response format)
interface LeaderboardEntry {
  playerId: string;
  name: string;
  nickname?: string;
  avatar: string;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  totalMoney: number;
}

const API_URL = import.meta.env.VITE_API_URL || '';
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:4849';

const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

export default function PresenterView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [sessionCode, setSessionCode] = useState('');
  const [sessionState, setSessionState] = useState<'LOBBY' | 'ACTIVE' | 'PAUSED' | 'CLOSED'>('LOBBY');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<QuestionMessage | null>(null);
  const [showDistribution, setShowDistribution] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [revealedCorrectIndex, setRevealedCorrectIndex] = useState<number | null>(null);
  const [answerDistribution, setAnswerDistribution] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [questionResults, setQuestionResults] = useState<Record<number, boolean>>({});
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showQROverlay, setShowQROverlay] = useState(false);
  
  // Round-related state
  const [currentRound, setCurrentRound] = useState<{ name: string; number: number; totalRounds: number } | null>(null);
  const [isOnBreak, setIsOnBreak] = useState(false);
  
  // Solace debug panel state
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [breakLeaderboard, setBreakLeaderboard] = useState<SharedLeaderboardEntry[]>([]);
  const [nextRoundName, setNextRoundName] = useState<string | undefined>();
  
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentQuestionId = useRef<string | null>(null);

  const { connected, subscribe } = useSolace();
  const { play, startTicking, stopTicking } = usePresenterSound();

  const joinUrl = `${CLIENT_URL}/join/${sessionCode}`;

  // Load session data initially
  useEffect(() => {
    const loadSessionData = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/admin/session/${sessionId}`);
        if (response.data.success) {
          const sessionData = response.data.data;
          setSessionCode(sessionData.code);
          setSessionState(sessionData.state || 'LOBBY');
          const playersArray = Array.isArray(sessionData.players) ? sessionData.players : [];
          setPlayers(playersArray);
          setTotalPlayers(playersArray.length);
          
          // If session is closed, fetch the leaderboard
          if (sessionData.state === 'CLOSED') {
            try {
              const leaderboardResponse = await axios.get(`${API_URL}/api/session/${sessionId}/leaderboard`);
              if (leaderboardResponse.data.success) {
                setLeaderboard(leaderboardResponse.data.data);
              }
            } catch (error) {
              console.error('Failed to fetch leaderboard:', error);
            }
          }
          
          // Load current round info if available (even if no question released yet)
          if (sessionData.currentRoundInfo) {
            console.log('📺 Loading current round from API:', sessionData.currentRoundInfo);
            setCurrentRound(sessionData.currentRoundInfo);
          }
          
          // Load current question if one is active
          if (sessionData.currentQuestion) {
            console.log('📺 Loading current question from API:', sessionData.currentQuestion);
            setCurrentQuestion(sessionData.currentQuestion);
            currentQuestionId.current = sessionData.currentQuestion.question.id;
            
            // Calculate remaining time
            const now = Date.now();
            const endTime = sessionData.currentQuestion.endTime;
            const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
            setTimeLeft(remaining);
            
            // Also set round info from question if available
            if (sessionData.currentQuestion.roundInfo) {
              setCurrentRound(sessionData.currentQuestion.roundInfo);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load session:', error);
      }
    };
    loadSessionData();
  }, [sessionId]);

  // Subscribe to player joined events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/player/*/joined`, (message) => {
      console.log('👥 Player joined:', message.payload);
      const newPlayer = message.payload;
      setPlayers(prev => {
        const exists = prev.some(p => p.id === newPlayer.id);
        if (exists) return prev;
        play('player-join');
        return [...prev, newPlayer];
      });
      setTotalPlayers(prev => prev + 1);
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, play]);

  // Subscribe to question released events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/question/released`, (message) => {
      const questionMsg = message.payload as QuestionMessage;
      console.log('📬 Question released:', questionMsg);
      
      if (currentQuestionId.current !== questionMsg.question.id) {
        currentQuestionId.current = questionMsg.question.id;
        setCurrentQuestion(questionMsg);
        setSessionState('ACTIVE');
        setAnsweredCount(0);
        setShowDistribution(false);
        setShowCorrectAnswer(false);
        setRevealedCorrectIndex(null);
        setAnswerDistribution({ 0: 0, 1: 0, 2: 0, 3: 0 });
        play('question-reveal');
        startTicking();
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, play, startTicking]);

  // Subscribe to answer stats updates
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/stats/answersUpdated`, (message) => {
      const stats = message.payload;
      console.log('📊 Answer stats updated:', stats);
      setAnsweredCount(stats.answeredCount);
      if (stats.totalPlayers) {
        setTotalPlayers(stats.totalPlayers);
      }
      if (stats.distribution) {
        setAnswerDistribution(stats.distribution);
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to admin show distribution event
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/admin/showDistribution`, (message) => {
      console.log('📊 Show distribution', message.payload);
      const data = message.payload;
      setShowDistribution(true);
      if (data.distribution) {
        setAnswerDistribution(data.distribution);
      }
      if (data.totalPlayers) {
        setTotalPlayers(data.totalPlayers);
      }
      stopTicking();
      play('show-distribution');
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, play, stopTicking]);

  // Subscribe to admin reveal answer event
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/admin/revealAnswer`, (message) => {
      console.log('✅ Reveal correct answer', message.payload);
      const data = message.payload;
      setShowCorrectAnswer(true);
      setShowDistribution(true);
      if (data && typeof data.correctIndex === 'number') {
        setRevealedCorrectIndex(data.correctIndex);
        // Update question results for the ladder
        if (currentQuestion) {
          setQuestionResults(prev => ({
            ...prev,
            [currentQuestion.questionNumber]: true
          }));
        }
        play('reveal-answer');
        setTimeout(() => play('correct-celebration'), 500);
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, currentQuestion, play]);

  // Subscribe to game ended event
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/game/ended`, async () => {
      console.log('🏆 Game ended');
      setSessionState('CLOSED');
      setCurrentQuestion(null);
      setIsOnBreak(false);
      stopTicking();
      play('leaderboard');
      
      // Fetch leaderboard
      try {
        const response = await axios.get(`${API_URL}/api/session/${sessionId}/leaderboard`);
        if (response.data.success) {
          setLeaderboard(response.data.data);
        }
      } catch (error) {
        console.error('Failed to fetch leaderboard:', error);
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, play, stopTicking]);

  // Subscribe to round started events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/round/started`, (message) => {
      const roundMsg = message.payload as RoundStartedMessage;
      console.log('🎯 Round started:', roundMsg);
      
      setCurrentRound({
        name: roundMsg.roundName,
        number: roundMsg.roundNumber,
        totalRounds: roundMsg.totalRounds
      });
      setIsOnBreak(false);
      setSessionState('ACTIVE');
      // Note: We don't reset currentQuestion here - it will be set by question/released
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to round ended events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/round/ended`, async (message) => {
      const roundMsg = message.payload as RoundEndedMessage;
      console.log('☕ Round ended:', roundMsg);
      
      setIsOnBreak(true);
      setSessionState('PAUSED');
      setBreakLeaderboard(roundMsg.leaderboard || []);
      setNextRoundName(roundMsg.nextRoundName);
      setCurrentQuestion(null);
      stopTicking();
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, stopTicking]);

  // Timer management with sound effects
  useEffect(() => {
    if (currentQuestion && !showDistribution) {
      const endTime = currentQuestion.endTime;
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
        const previousTime = timeLeft;
        setTimeLeft(remaining);
        
        // Play tension sound when crossing into last 5 seconds
        if (previousTime === 6 && remaining === 5) {
          play('timer-tension');
        }
        
        // Play time-up sound when timer hits zero
        if (previousTime === 1 && remaining === 0) {
          stopTicking();
          play('time-up');
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 100);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      stopTicking();
    }
  }, [currentQuestion, showDistribution, timeLeft, play, stopTicking]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Helper function to render main content based on current game state
  const renderMainContent = () => {
    // Render break screen between rounds
    if (isOnBreak && sessionState === 'PAUSED') {
      return (
      <div className="min-h-screen bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-navy-dark flex flex-col relative overflow-auto">
        {/* Top Banner */}
        <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0 z-20">
          <div className="flex items-center justify-between">
            <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80" />
            <div className="flex items-center gap-3">
              <PresenterSoundToggle />
              <SolaceStatusIndicator />
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`p-1.5 rounded-lg transition-colors ${showDebugPanel ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'}`}
                title={showDebugPanel ? 'Hide Solace Messages' : 'Show Solace Messages'}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          className="absolute top-16 right-4 p-2 bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50 rounded-lg text-white transition-colors z-10"
        >
          {isFullscreen ? '⊠' : '⛶'}
        </button>

        {/* Break screen content */}
        <div className="flex-1 p-6 flex flex-col items-center justify-center overflow-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-4xl w-full"
          >
            {/* Break header */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
              className="text-8xl mb-6 drop-shadow-[0_0_30px_rgba(247,148,29,0.5)]"
            >
              ☕
            </motion.div>
            <h1 className="text-5xl md:text-6xl font-black text-white mb-4"
                style={{ textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
              Break Time!
            </h1>
            <p className="text-2xl text-orange-400 mb-8">
              {currentRound?.name && `${currentRound.name} completed!`}
            </p>

            {nextRoundName && (
              <motion.p 
                className="text-xl text-gray-300 mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                Coming up next: <span className="text-orange-400 font-bold">{nextRoundName}</span>
              </motion.p>
            )}

            {/* Leaderboard during break */}
            {breakLeaderboard.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-2xl p-6 border-2 border-orange-500 shadow-[0_0_30px_rgba(255,149,0,0.4)]"
              >
                <h2 className="text-2xl font-bold text-orange-400 mb-6">Current Standings</h2>
                <div className="space-y-3">
                  {breakLeaderboard.slice(0, 10).map((entry, idx) => (
                    <motion.div
                      key={entry.playerId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 * idx }}
                      className={`flex justify-between items-center p-4 rounded-xl ${
                        idx < 3 
                          ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/50' 
                          : 'bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`text-3xl ${idx < 3 ? '' : 'text-gray-400'}`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                        </span>
                        <span className="text-xl text-white font-semibold">{entry.nickname}</span>
                      </div>
                      <span className="text-2xl text-orange-400 font-bold">
                        {formatMoney(entry.totalMoney)}
                      </span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, delay: 1 }}
              className="mt-8 text-lg text-gray-400"
            >
              Waiting for host to start the next round...
            </motion.p>
          </motion.div>
        </div>
      </div>
      );
    }

    // Render distribution view
    if (showDistribution && currentQuestion) {
    const totalAnswers = Object.values(answerDistribution).reduce((a, b) => a + b, 0);
    const stats = [0, 1, 2, 3].map((choiceIndex) => ({
      choiceIndex,
      count: answerDistribution[choiceIndex] || 0,
      percentage: totalAnswers > 0 ? ((answerDistribution[choiceIndex] || 0) / totalAnswers) * 100 : 0
    }));

    return (
      <div className="min-h-screen bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-navy-dark flex flex-col relative">
        {/* Top Banner */}
        <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0">
          <div className="flex items-center justify-between">
            {/* Solace Logo - Left */}
            <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80" />
            
            {/* Right side controls */}
            <div className="flex items-center gap-3">
              <PresenterSoundToggle />
              <SolaceStatusIndicator />
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`p-1.5 rounded-lg transition-colors ${showDebugPanel ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'}`}
                title={showDebugPanel ? 'Hide Solace Messages' : 'Show Solace Messages'}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Flex Container for Main Content + Sliding Debug Panel */}
        <div className="flex flex-1 overflow-hidden">
          <motion.div
            animate={{ 
              width: '100%' 
            }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex flex-col overflow-hidden"
          >
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
              {/* Fullscreen button */}
              <button
                onClick={toggleFullscreen}
                className="absolute top-4 right-4 p-2 bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50 rounded-lg text-white transition-colors"
              >
                {isFullscreen ? '⊠' : '⛶'}
              </button>

              {/* QR Code toggle button */}
              <button
                onClick={() => setShowQROverlay(!showQROverlay)}
                className={`absolute top-4 right-16 p-2 rounded-lg text-white transition-colors ${
                  showQROverlay ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'
                }`}
                title={showQROverlay ? 'Hide QR Code' : 'Show QR Code for late joiners'}
              >
                📱
              </button>

          <div className="max-w-5xl w-full">
            <AnswerDistributionChart
              questionText={currentQuestion.question.text}
              choices={currentQuestion.question.choices}
              correctIndex={showCorrectAnswer && revealedCorrectIndex !== null ? revealedCorrectIndex : -1}
              stats={stats}
              totalResponses={totalAnswers}
              showCorrectAnswer={showCorrectAnswer}
            />
          </div>

          {/* QR Code Overlay for late joiners */}
          <AnimatePresence>
            {showQROverlay && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-2xl"
              >
                <div className="text-center mb-2">
                  <p className="text-gray-800 font-bold text-sm">Scan to Join!</p>
                  <p className="text-gray-600 text-xs">Code: {sessionCode}</p>
                </div>
                <QRCodeSVG value={joinUrl} size={150} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
      </div>
      );
    }

    // Render "Round Starting" view when round is active but no question yet
    if (sessionState === 'ACTIVE' && !currentQuestion && currentRound) {
      return (
      <div className="min-h-screen bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-navy-dark flex flex-col relative overflow-hidden">
        {/* Top Banner */}
        <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0 z-20">
          <div className="flex items-center justify-between">
            <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80" />
            <div className="flex items-center gap-3">
              <PresenterSoundToggle />
              <SolaceStatusIndicator />
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`p-1.5 rounded-lg transition-colors ${showDebugPanel ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'}`}
                title={showDebugPanel ? 'Hide Solace Messages' : 'Show Solace Messages'}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={toggleFullscreen}
          className="absolute top-16 right-4 p-2 bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50 rounded-lg text-white transition-colors z-10"
        >
          {isFullscreen ? '⊠' : '⛶'}
        </button>

        {/* Flex Container for Main Content + Sliding Debug Panel */}
        <div className="flex flex-1 overflow-hidden">
          <motion.div
            animate={{ 
              width: '100%' 
            }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex flex-col overflow-hidden"
          >
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative">
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center max-w-4xl w-full"
              >
                {/* Round Starting Header */}
            <motion.div
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-8xl mb-6 drop-shadow-[0_0_30px_rgba(34,197,94,0.5)]"
            >
              🎮
            </motion.div>
            <h1 className="text-5xl md:text-6xl font-black text-white mb-4"
                style={{ textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
              Get Ready!
            </h1>
            <p className="text-3xl text-green-400 mb-4 font-bold">
              {currentRound.name}
            </p>
            <p className="text-xl text-gray-300 mb-8">
              Round {currentRound.number} of {currentRound.totalRounds}
            </p>

            {/* Player count */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="bg-millionaire-navy/50 border-2 border-green-500/50 rounded-2xl px-12 py-6 inline-block"
            >
              <div className="flex items-center justify-center gap-4">
                <span className="text-5xl">👥</span>
                <div>
                  <p className="text-5xl font-black text-white">{players.length}</p>
                  <p className="text-xl text-green-300">Players Ready</p>
                </div>
              </div>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              className="mt-8 text-xl text-gray-400"
            >
              Waiting for host to release the first question...
            </motion.p>
          </motion.div>
        </div>
      </motion.div>
    </div>
      </div>
      );
    }

    // Render lobby view with QR code (only when truly in LOBBY state, not when CLOSED)
    if ((sessionState === 'LOBBY' || !currentQuestion) && sessionState !== 'CLOSED') {
      return (
      <div className="min-h-screen bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-navy-dark flex flex-col relative overflow-hidden">
        {/* Top Banner */}
        <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0 z-20">
          <div className="flex items-center justify-between">
            {/* Solace Logo - Left */}
            <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80" />
            
            {/* Right side controls */}
            <div className="flex items-center gap-3">
              <PresenterSoundToggle />
              <SolaceStatusIndicator />
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`p-1.5 rounded-lg transition-colors ${showDebugPanel ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'}`}
                title={showDebugPanel ? 'Hide Solace Messages' : 'Show Solace Messages'}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Flex Container for Main Content + Sliding Debug Panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content Area - Slides left when debug panel opens */}
          <motion.div
            animate={{ 
              width: '100%' 
            }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex flex-col overflow-hidden"
          >
            <div className="flex-1 flex flex-col items-center justify-center p-6 relative overflow-hidden">
              {/* Background decorative elements */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
              </div>

              {/* Fullscreen button */}
              <button
                onClick={toggleFullscreen}
                className="absolute top-4 right-4 p-2 bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50 rounded-lg text-white transition-colors z-10"
              >
                {isFullscreen ? '⊠' : '⛶'}
              </button>

              {/* Three-Column Layout */}
              <div className="relative z-10 w-full max-w-7xl mx-auto">
                {/* Title with Solace branding */}
                <div className="mb-8 text-center">
                  <h1 className="text-4xl md:text-6xl font-black bg-gradient-to-br from-orange-400 via-amber-400 to-orange-500 text-transparent bg-clip-text mb-4"
                      style={{ 
                        filter: 'drop-shadow(0 0 30px rgba(255,149,0,0.5))',
                        WebkitTextStroke: '1px rgba(255,149,0,0.2)'
                      }}>
                    💎 TRIVIA MILLIONAIRE
                  </h1>
                  <div className="flex items-center justify-center gap-3">
                    <span className="text-gray-400 text-lg">powered by</span>
                    <img src="/solace-logo.svg" alt="Solace" className="h-8 opacity-90" />
                  </div>
                </div>

                {/* Three Columns Grid */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-3 gap-8"
                >
                  {/* Column 1: QR Code + Session Info */}
                  <div className="flex flex-col items-center">
                    {/* QR Code */}
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1 }}
                      className="bg-white p-4 rounded-2xl shadow-2xl shadow-orange-500/20 mb-4"
                    >
                      <QRCodeSVG value={joinUrl} size={240} />
                    </motion.div>

                    {/* Session Code */}
                    <div className="w-full text-center">
                      <p className="text-sm text-gray-300 mb-2">Scan QR or visit</p>
                      <p className="text-md font-mono text-orange-400 mb-3 break-all px-2">{CLIENT_URL}</p>
                      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white px-6 py-3 rounded-xl">
                        <p className="text-sm font-semibold mb-1">Session Code</p>
                        <p className="text-3xl font-black tracking-widest">{sessionCode}</p>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: How to Play Instructions */}
                  <div className="flex flex-col">
                    <div className="bg-gradient-to-br from-millionaire-blue/20 to-millionaire-navy/20 rounded-xl p-6 border border-millionaire-blue/40 backdrop-blur-sm h-full">
                      <div className="flex items-center gap-2 mb-4">
                        <span className="text-3xl">📋</span>
                        <h3 className="text-2xl font-bold text-orange-400">How to Play</h3>
                      </div>
                      <ul className="text-left text-base text-gray-300 space-y-3">
                        <li className="flex items-start gap-2">
                          <span className="text-orange-400 font-bold text-xl mt-0.5">1.</span>
                          <span>Answer trivia questions correctly to climb the money ladder</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-orange-400 font-bold text-xl mt-0.5">2.</span>
                          <span><strong className="text-green-400">Answer faster for bonus points!</strong> Up to 50% extra</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-orange-400 font-bold text-xl mt-0.5">3.</span>
                          <span>Each correct answer increases your winnings on the ladder</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="text-orange-400 font-bold text-xl mt-0.5">4.</span>
                          <span>Compete with other players for the top spot on the leaderboard</span>
                        </li>
                      </ul>
                      <div className="mt-6 pt-4 border-t border-millionaire-blue/30 text-center">
                        <p className="text-sm text-orange-300 font-semibold">🎯 Good luck, and may the best trivia master win!</p>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Player List */}
                  <div className="flex flex-col">
                    <div className="bg-millionaire-navy/50 border-2 border-millionaire-blue/50 rounded-2xl p-6 h-full flex flex-col">
                      <div className="flex items-center gap-3 mb-4">
                        <span className="text-3xl">👥</span>
                        <div>
                          <p className="text-4xl font-black text-white">{players.length}</p>
                          <p className="text-lg text-purple-300">
                            {players.length === 1 ? 'Player' : 'Players'} Joined
                          </p>
                        </div>
                      </div>
                      
                      {/* Player List */}
                      <div className="flex-1 overflow-y-auto space-y-2 max-h-[400px]">
                        <AnimatePresence>
                          {players.length === 0 ? (
                            <p className="text-gray-400 text-center py-4">Waiting for players to join...</p>
                          ) : (
                            players.map((player, index) => (
                              <motion.div
                                key={player.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ delay: index * 0.05 }}
                                className="flex items-center gap-3 bg-millionaire-navy-dark/50 rounded-lg p-3 border border-millionaire-blue/30"
                              >
                                <span className="text-2xl">{getAvatarEmoji(player.avatar)}</span>
                                <span className="text-white font-medium">{player.nickname}</span>
                              </motion.div>
                            ))
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Waiting message */}
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="mt-6 text-xl text-gray-400 text-center"
                >
                  Waiting for the game to start...
                </motion.p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
      );
    }

    // Render game ended view with leaderboard
    if (sessionState === 'CLOSED') {
      return (
      <div className="min-h-screen bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-navy-dark flex flex-col relative overflow-auto">
        {/* Top Banner */}
        <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0 z-20">
          <div className="flex items-center justify-between">
            {/* Solace Logo - Left */}
            <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80" />
            
            {/* Right side controls */}
            <div className="flex items-center gap-3">
              <PresenterSoundToggle />
              <SolaceStatusIndicator />
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`p-1.5 rounded-lg transition-colors ${showDebugPanel ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'}`}
                title={showDebugPanel ? 'Hide Solace Messages' : 'Show Solace Messages'}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Fullscreen button */}
        <button
          onClick={toggleFullscreen}
          className="absolute top-16 right-4 p-2 bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50 rounded-lg text-white transition-colors z-10"
        >
          {isFullscreen ? '⊠' : '⛶'}
        </button>

        {/* Flex Container for Main Content + Sliding Debug Panel */}
        <div className="flex flex-1 overflow-hidden">
          <motion.div
            animate={{ 
              width: '100%' 
            }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex flex-col overflow-auto"
          >
            <div className="flex-1 p-6 flex flex-col items-center">
              <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-4xl w-full"
          >
            {/* Header */}
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-center mb-8"
            >
              <h1 className="text-5xl md:text-6xl font-black text-white mb-2 flex items-center justify-center gap-3"
                  style={{ textShadow: '0 4px 12px rgba(0,0,0,0.8)' }}>
                <span>🏆</span>
                <span>Final Leaderboard</span>
                <span>🏆</span>
              </h1>
              <p className="text-xl text-gray-400">{leaderboard.length} players</p>
            </motion.div>

            {/* Leaderboard */}
            {leaderboard.length === 0 ? (
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
                className="bg-gradient-to-br from-millionaire-navy/80 to-millionaire-navy-dark/80 backdrop-blur-sm rounded-2xl p-6 md:p-8 border border-orange-500/50"
              >
                {/* Top 3 Podium */}
                {leaderboard.length >= 3 && (
                  <div className="flex justify-center items-end gap-4 md:gap-8 mb-10 pt-6">
                    {/* 2nd Place */}
                    <motion.div
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.3 }}
                      className="flex flex-col items-center"
                    >
                      <div className="text-5xl md:text-6xl mb-2">{getAvatarEmoji(leaderboard[1].avatar)}</div>
                      <div className="text-lg font-bold text-gray-200 truncate max-w-[120px] text-center">
                        {leaderboard[1].name}
                      </div>
                      <div className="text-base text-orange-400 font-bold">
                        {formatMoneyShared(leaderboard[1].totalMoney)}
                      </div>
                      <div className="w-24 md:w-28 h-20 bg-gradient-to-t from-gray-400 to-gray-300 rounded-t-lg mt-3 flex items-center justify-center">
                        <span className="text-4xl">🥈</span>
                      </div>
                    </motion.div>

                    {/* 1st Place */}
                    <motion.div
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.2 }}
                      className="flex flex-col items-center"
                    >
                      <div className="text-6xl md:text-7xl mb-2">{getAvatarEmoji(leaderboard[0].avatar)}</div>
                      <div className="text-xl font-bold text-white truncate max-w-[120px] text-center">
                        {leaderboard[0].name}
                      </div>
                      <div className="text-lg text-orange-400 font-bold">
                        {formatMoneyShared(leaderboard[0].totalMoney)}
                      </div>
                      <div className="w-28 md:w-32 h-28 bg-gradient-to-t from-yellow-500 to-yellow-400 rounded-t-lg mt-3 flex items-center justify-center shadow-[0_0_40px_rgba(255,200,0,0.5)]">
                        <span className="text-5xl">🥇</span>
                      </div>
                    </motion.div>

                    {/* 3rd Place */}
                    <motion.div
                      initial={{ y: 50, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="flex flex-col items-center"
                    >
                      <div className="text-5xl md:text-6xl mb-2">{getAvatarEmoji(leaderboard[2].avatar)}</div>
                      <div className="text-lg font-bold text-gray-200 truncate max-w-[120px] text-center">
                        {leaderboard[2].name}
                      </div>
                      <div className="text-base text-orange-400 font-bold">
                        {formatMoneyShared(leaderboard[2].totalMoney)}
                      </div>
                      <div className="w-24 md:w-28 h-16 bg-gradient-to-t from-amber-700 to-amber-600 rounded-t-lg mt-3 flex items-center justify-center">
                        <span className="text-4xl">🥉</span>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Full List */}
                <div className="space-y-3">
                  {leaderboard.map((entry, index) => {
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
                        className="flex items-center gap-4 p-4 rounded-xl bg-millionaire-navy-dark/50 hover:bg-millionaire-navy/50 transition-all"
                      >
                        <div className={`w-12 text-center font-bold ${index < 3 ? 'text-2xl' : 'text-lg text-gray-400'}`}>
                          {rankDisplay}
                        </div>
                        <div className="text-3xl">{getAvatarEmoji(entry.avatar)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-lg text-gray-200 truncate">
                            {entry.name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {entry.correctAnswers}/{entry.totalAnswers} correct • {accuracy}% accuracy
                          </div>
                        </div>
                        <div className="font-black text-xl text-orange-400">
                          {formatMoneyShared(entry.totalMoney)}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            <div className="flex items-center justify-center gap-3 mt-8 text-lg text-gray-500">
              <span>powered by</span>
              <img src="/solace-logo.svg" alt="Solace" className="h-8 opacity-80" />
            </div>
          </motion.div>
        </div>
      </motion.div>
    </div>
      </div>
      );
    }

    // Render question view (default)
    return (
    <div className="min-h-screen bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-navy-dark flex flex-col relative">
      {/* Top Banner */}
      <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Solace Logo - Left */}
          <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80" />
          
          {/* Right side controls */}
          <div className="flex items-center gap-3">
            <PresenterSoundToggle />
            <SolaceStatusIndicator />
            <button
              onClick={() => setShowDebugPanel(!showDebugPanel)}
              className={`p-1.5 rounded-lg transition-colors ${showDebugPanel ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'}`}
              title={showDebugPanel ? 'Hide Solace Messages' : 'Show Solace Messages'}
            >
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen button */}
      <button
        onClick={toggleFullscreen}
        className="absolute top-14 left-4 p-2 bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50 rounded-lg text-white transition-colors z-10"
      >
        {isFullscreen ? '⊠' : '⛶'}
      </button>

      {/* QR Code toggle button */}
      <button
        onClick={() => setShowQROverlay(!showQROverlay)}
        className={`absolute top-14 left-16 p-2 rounded-lg text-white transition-colors z-10 ${
          showQROverlay ? 'bg-orange-600 hover:bg-orange-500' : 'bg-millionaire-navy/50 hover:bg-millionaire-navy-light/50'
        }`}
        title={showQROverlay ? 'Hide QR Code' : 'Show QR Code for late joiners'}
      >
        📱
      </button>

      {/* QR Code Overlay for late joiners */}
      <AnimatePresence>
        {showQROverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="absolute bottom-4 right-4 bg-white p-4 rounded-xl shadow-2xl z-20"
          >
            <div className="text-center mb-2">
              <p className="text-gray-800 font-bold text-sm">Scan to Join!</p>
              <p className="text-gray-600 text-xs">Code: {sessionCode}</p>
            </div>
            <QRCodeSVG value={joinUrl} size={150} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Flex Container for Main Content + Sliding Debug Panel */}
      <div className="flex flex-1 overflow-hidden">
        <motion.div
          animate={{ 
            width: '100%' 
          }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="flex flex-col overflow-hidden"
        >
          {/* Main Content */}
          <div className="flex-1 flex p-4">
        <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
          {/* Header - Timer & Stats */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-between items-center mb-4"
          >
            {/* Answered count */}
            <div className="relative">
              <div className="absolute inset-0 bg-orange-500/20 blur-2xl rounded-full"></div>
              <div className="relative px-4 md:px-8 py-2 md:py-4">
                <div className="text-xs md:text-sm text-orange-400 font-bold uppercase tracking-wider mb-1">Responses</div>
                <div className="text-3xl md:text-5xl font-black text-white">
                  {answeredCount} / {totalPlayers}
                </div>
              </div>
            </div>

            {/* Timer */}
            <div className="relative">
              <div className="absolute inset-0 -m-2">
                <svg className="w-full h-full" viewBox="0 0 100 100">
                  <circle
                    cx="50" cy="50" r="46"
                    fill="none"
                    stroke="url(#timerGradientPresenter)"
                    strokeWidth="3"
                    className="opacity-60"
                  />
                  {[...Array(12)].map((_, i) => (
                    <line
                      key={i}
                      x1="50" y1="6" x2="50" y2="10"
                      stroke="#f97316"
                      strokeWidth="2"
                      transform={`rotate(${i * 30} 50 50)`}
                      className="opacity-70"
                    />
                  ))}
                  <defs>
                    <linearGradient id="timerGradientPresenter" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" />
                      <stop offset="50%" stopColor="#fbbf24" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              
              <motion.div
                animate={{
                  scale: timeLeft <= 5 ? [1, 1.08, 1] : 1,
                }}
                transition={{ duration: 0.6, repeat: timeLeft <= 5 ? Infinity : 0 }}
                className={`relative rounded-full w-16 h-16 md:w-20 md:h-20 flex items-center justify-center text-2xl md:text-3xl font-black border-4 ${
                  timeLeft <= 5
                    ? 'bg-gradient-to-br from-red-600 to-red-800 text-white border-red-400 shadow-[0_0_30px_rgba(239,68,68,0.7)]'
                    : 'bg-gradient-to-br from-gray-900 to-gray-800 text-white border-orange-500 shadow-[0_0_25px_rgba(249,115,22,0.5)]'
                }`}
                style={{ textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}
              >
                {timeLeft}
              </motion.div>
            </div>
          </motion.div>

          {/* Question Content */}
          <AnimatePresence mode="wait">
            {currentQuestion && (
              <motion.div
                key={currentQuestion.question.id}
                initial={{ opacity: 0, y: 50 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -50 }}
                className="flex-1 flex flex-col"
              >
                {/* Question Number & Money Value */}
                <div className="text-center text-white mb-6">
                  <div className="text-sm md:text-base font-bold text-blue-300/90 mb-2 tracking-wide">
                    Question {currentQuestion.questionNumber} of {currentQuestion.totalQuestions}
                  </div>
                  <div className="text-3xl md:text-4xl lg:text-5xl font-black bg-gradient-to-br from-orange-400 via-amber-400 to-orange-500 text-transparent bg-clip-text"
                       style={{ 
                         filter: 'drop-shadow(0 0 20px rgba(255,149,0,0.7))',
                         WebkitTextStroke: '1px rgba(255,149,0,0.2)'
                       }}>
                    {formatMoney(MONEY_LADDER[currentQuestion.questionNumber - 1]?.amount || 0)}
                  </div>
                </div>

                {/* Question Text Box */}
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="relative mb-8 px-[6%]"
                >
                  {/* Extending lines - Left */}
                  <div 
                    className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] z-10"
                    style={{
                      width: '6%',
                      background: 'linear-gradient(to right, transparent 0%, #FFB81C 70%, #F7941D 100%)',
                      boxShadow: '0 0 10px rgba(247, 148, 29, 0.6)'
                    }}
                  />
                  {/* Extending lines - Right */}
                  <div 
                    className="absolute right-0 top-1/2 -translate-y-1/2 h-[3px] z-10"
                    style={{
                      width: '6%',
                      background: 'linear-gradient(to left, transparent 0%, #FFB81C 70%, #F7941D 100%)',
                      boxShadow: '0 0 10px rgba(247, 148, 29, 0.6)'
                    }}
                  />
                  
                  {/* Question container */}
                  <div 
                    className="relative bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 px-8 py-5 md:px-12 md:py-6 lg:px-16 lg:py-7"
                    style={{
                      clipPath: 'polygon(5% 0%, 95% 0%, 100% 50%, 95% 100%, 5% 100%, 0% 50%)',
                      boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 25px rgba(247, 148, 29, 0.3), inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.5)'
                    }}
                  >
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        clipPath: 'polygon(5% 0%, 95% 0%, 100% 50%, 95% 100%, 5% 100%, 0% 50%)',
                        border: '3px solid #F7941D',
                        boxShadow: 'inset 0 0 15px rgba(247, 148, 29, 0.3)'
                      }}
                    />
                    
                    <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-white text-center relative z-10 leading-snug"
                        style={{ textShadow: '0 3px 8px rgba(0,0,0,0.6), 0 0 20px rgba(59,130,246,0.3)' }}>
                      {currentQuestion.question.text}
                    </h2>
                  </div>
                </motion.div>

                {/* Answer Choices - Read Only */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-y-4 gap-x-0 mb-6 px-[4%]">
                  {currentQuestion.question.choices.map((choice, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6 + (index * 0.1), duration: 0.4 }}
                      className="relative bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 px-6 py-4 mx-0 border-2 border-orange-500/60"
                      style={{
                        clipPath: index % 2 === 0
                          ? 'polygon(0% 0%, 97% 0%, 100% 50%, 97% 100%, 0% 100%, 3% 50%)'
                          : 'polygon(3% 0%, 100% 0%, 97% 50%, 100% 100%, 3% 100%, 0% 50%)',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
                      }}
                    >
                      <div className="flex items-center">
                        <span className="text-orange-400 font-black text-xl mr-4">
                          {ANSWER_LETTERS[index]}:
                        </span>
                        <span className="text-white font-semibold text-lg">
                          {choice}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Money Ladder - Right Side */}
        {currentQuestion && (
          <div className="hidden xl:block w-56 ml-6 pl-3">
            <MoneyLadder 
              currentQuestion={currentQuestion.questionNumber} 
              totalQuestions={currentQuestion.totalQuestions}
              questionResults={questionResults}
              className="sticky top-4"
            />
          </div>
        )}
      </div>
    </motion.div>
  </div>

      {/* Footer Credit Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-millionaire-navy-dark/95 backdrop-blur-sm border-t border-millionaire-gold/30">
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
  };

  // Single persistent return that keeps the debug panel mounted across all state changes
  return (
    <div className="flex h-screen overflow-hidden">
      {/* Main content area - changes based on game state */}
      <div className="flex-1 overflow-hidden">
        {renderMainContent()}
      </div>

      {/* Debug panel - always mounted at this level, just shown/hidden */}
      <AnimatePresence>
        {showDebugPanel && sessionId && (
          <motion.div
            initial={{ x: 500 }}
            animate={{ x: 0 }}
            exit={{ x: 500 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="flex-shrink-0 h-full border-l border-millionaire-gold/30"
          >
            <SolaceDebugPanel
              sessionId={sessionId}
              onClose={() => setShowDebugPanel(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
