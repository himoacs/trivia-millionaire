import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { QuestionMessage, ScoreUpdate, RoundStartedMessage, RoundEndedMessage, LeaderboardEntry } from '@trivia-millionaire/shared';
import { formatMoney } from '@trivia-millionaire/shared';
import { useSolace } from '../hooks/useSolace';
import { MoneyLadder, MONEY_LADDER, formatMoney as formatMoneyLadder } from '../components/MoneyLadder';
import AnswerDistributionChart from '../components/AnswerDistributionChart';
import { useSound } from '../utils/sound';
import SoundToggle from '../components/SoundToggle';

// Answer letters A, B, C, D
const ANSWER_LETTERS = ['A', 'B', 'C', 'D'];

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4847';

export default function Game() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [currentQuestion, setCurrentQuestion] = useState<QuestionMessage | null>(null);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [totalMoney, setTotalMoney] = useState(0);
  const [questionResults, setQuestionResults] = useState<Record<number, boolean>>({});
  const pendingQuestionResult = useRef<{ questionNumber: number; correct: boolean } | null>(null);
  // Pending score update - applied only when admin reveals answer (to keep result a mystery)
  const pendingScoreUpdate = useRef<{ totalMoney: number; correct: boolean } | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isAnswered, setIsAnswered] = useState(false);
  const [waiting, setWaiting] = useState(true);
  const [sessionState, setSessionState] = useState<'LOBBY' | 'ACTIVE' | 'PAUSED' | 'CLOSED'>('LOBBY');
  const [showWaitingForOthers, setShowWaitingForOthers] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [showDistribution, setShowDistribution] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [revealedCorrectIndex, setRevealedCorrectIndex] = useState<number | null>(null);
  const [answerDistribution, setAnswerDistribution] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const timerRef = useRef<NodeJS.Timeout>();
  const currentQuestionId = useRef<string | null>(null);

  // Round-related state
  const [currentRound, setCurrentRound] = useState<{ name: string; number: number; totalRounds: number } | null>(null);
  const [isOnBreak, setIsOnBreak] = useState(false);
  const [breakLeaderboard, setBreakLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [nextRoundName, setNextRoundName] = useState<string | undefined>();
  const [hasReconnected, setHasReconnected] = useState(false);

  // Lifeline states
  const [usedFiftyFifty, setUsedFiftyFifty] = useState(false);
  const [usedAskAI, setUsedAskAI] = useState(false);
  const [eliminatedAnswers, setEliminatedAnswers] = useState<number[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<number | null>(null);
  const [isAskingAI, setIsAskingAI] = useState(false);

  const playerId = localStorage.getItem('playerId') || '';

  // Sound effects
  const { play: playSound } = useSound();

  // Connect to Solace
  const { connected, subscribe, publish } = useSolace();

  // Try to reconnect on mount using stored token
  useEffect(() => {
    const attemptReconnect = async () => {
      const token = localStorage.getItem('reconnectToken');
      const storedSessionId = localStorage.getItem('reconnectSessionId');
      
      if (!token || !storedSessionId || storedSessionId !== sessionId || hasReconnected) {
        return;
      }

      try {
        console.log('🔄 Attempting reconnection...');
        const response = await axios.post(`${API_URL}/api/session/${sessionId}/reconnect`, { token });
        
        if (response.data.success && response.data.data.success) {
          const data = response.data.data;
          console.log('✅ Reconnected successfully:', data.player?.nickname);
          
          // Restore player state
          if (data.player) {
            setTotalMoney(data.player.totalMoney || 0);
            setCorrectAnswers(data.player.correctAnswers || 0);
          }
          
          // Restore session state
          if (data.sessionState) {
            setSessionState(data.sessionState);
            if (data.sessionState === 'PAUSED') {
              setIsOnBreak(true);
            }
          }
          
          // Restore current round info
          if (data.currentRound) {
            setCurrentRound({
              name: data.currentRound.name,
              number: 0, // Will be updated by round events
              totalRounds: 0
            });
          }
          
          // Restore current question if any
          if (data.currentQuestion && data.sessionState === 'ACTIVE') {
            setCurrentQuestion(data.currentQuestion);
            setWaiting(false);
            currentQuestionId.current = data.currentQuestion.question.id;
          }
          
          setHasReconnected(true);
        }
      } catch (error) {
        console.log('Reconnection failed, continuing as new session');
      }
    };

    attemptReconnect();
  }, [sessionId, hasReconnected]);

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
      setWaiting(true);
      setSessionState('ACTIVE');
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to round ended events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/round/ended`, (message) => {
      const roundMsg = message.payload as RoundEndedMessage;
      console.log('☕ Round ended:', roundMsg);
      
      setIsOnBreak(true);
      setSessionState('PAUSED');
      setBreakLeaderboard(roundMsg.leaderboard || []);
      setNextRoundName(roundMsg.nextRoundName);
      setWaiting(true);
      setCurrentQuestion(null);
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to question released events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/question/released`, (message) => {
      const questionMsg = message.payload as QuestionMessage;
      console.log('📬 Question released:', questionMsg);
      
      // New question arrived
      if (currentQuestionId.current !== questionMsg.question.id) {
        // Commit pending question result to the ladder before switching to new question
        if (pendingQuestionResult.current) {
          const result = pendingQuestionResult.current;
          pendingQuestionResult.current = null;
          setQuestionResults(prev => ({
            ...prev,
            [result.questionNumber]: result.correct
          }));
        }
        
        currentQuestionId.current = questionMsg.question.id;
        setCurrentQuestion(questionMsg);
        setWaiting(false);
        setIsAnswered(false);
        setSelectedAnswer(null);
        setShowWaitingForOthers(false);
        setAnsweredCount(0);
        // Reset distribution and reveal states for new question
        setShowDistribution(false);
        setShowCorrectAnswer(false);
        setAnswerDistribution({});
        // Reset lifeline effects for new question (but keep used state)
        setEliminatedAnswers([]);
        setAiSuggestion(null);
        
        // Play question start sound
        playSound('question-start');
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Fetch current question on mount (for late joiners)
  useEffect(() => {
    const fetchCurrentQuestion = async () => {
      if (!sessionId) return;
      
      try {
        const response = await axios.get(`${API_URL}/api/session/${sessionId}/current-question`);
        if (response.data.success && response.data.data) {
          const data = response.data.data;
          
          // Update session state
          if (data.state) {
            setSessionState(data.state);
          }
          
          // If there's an active question, set it
          if (!data.waiting && data.question) {
            const questionMsg = data.question as QuestionMessage;
            
            // Only set if we don't already have this question and it hasn't expired
            if (currentQuestionId.current !== questionMsg.question.id && questionMsg.endTime > Date.now()) {
              currentQuestionId.current = questionMsg.question.id;
              setCurrentQuestion(questionMsg);
              setWaiting(false);
              setSessionState('ACTIVE');
              console.log('📬 Late join - fetched current question:', questionMsg);
            }
          }
        }
      } catch (error) {
        console.log('No active question to fetch');
      }
    };

    fetchCurrentQuestion();
  }, [sessionId]);

  // Subscribe to score update events
  useEffect(() => {
    if (!connected || !sessionId || !playerId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/player/${playerId}/scored`, (message) => {
      const scoreUpdate = message.payload as ScoreUpdate;
      console.log('💯 Player scored (pending until reveal):', scoreUpdate);
      
      // Store the score update as pending - will be applied when admin reveals answer
      // This keeps the result a mystery until the reveal
      pendingScoreUpdate.current = {
        totalMoney: scoreUpdate.totalMoney,
        correct: scoreUpdate.correct
      };
      
      // Store this question's result as pending (will show on ladder when next question starts)
      if (currentQuestion) {
        pendingQuestionResult.current = {
          questionNumber: currentQuestion.questionNumber,
          correct: scoreUpdate.correct
        };
      }
      
      // NOTE: We intentionally don't update money, correctAnswers count, or play sounds here
      // to keep the result a mystery until the admin reveals the correct answer
    });

    return unsubscribe;
  }, [connected, sessionId, playerId, subscribe]);

  // Subscribe to game ended event
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/game/ended`, async () => {
      console.log('🏆 Game ended, showing results');
      
      // Commit any pending question result before game ends
      if (pendingQuestionResult.current) {
        const result = pendingQuestionResult.current;
        pendingQuestionResult.current = null;
        setQuestionResults(prev => ({
          ...prev,
          [result.questionNumber]: result.correct
        }));
      }
      
      // Clear pending score update - final scores come from leaderboard
      pendingScoreUpdate.current = null;
      
      setSessionState('CLOSED');
      setWaiting(true);
      setCurrentQuestion(null);
      
      // Fetch player's final score from leaderboard to ensure accuracy
      try {
        const response = await axios.get(`${API_URL}/api/session/${sessionId}/leaderboard`);
        if (response.data.success) {
          const playerData = response.data.data.find((p: any) => p.playerId === playerId);
          if (playerData) {
            setTotalMoney(playerData.totalMoney);
            setCorrectAnswers(playerData.correctAnswers);
            console.log('📊 Updated final score from leaderboard:', playerData.totalMoney);
          }
        }
      } catch (error) {
        console.error('Failed to fetch final score:', error);
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe, playerId]);

  // Subscribe to answer stats updates
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/stats/answersUpdated`, (message) => {
      const stats = message.payload;
      console.log('📊 Answer stats updated:', stats);
      setAnsweredCount(stats.answeredCount);
      setTotalPlayers(stats.totalPlayers);
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
      console.log('📊 Admin triggered: Show distribution', message.payload);
      const data = message.payload;
      setShowDistribution(true);
      setShowWaitingForOthers(false); // Hide waiting screen
      if (data.distribution) {
        console.log('Setting distribution:', data.distribution);
        setAnswerDistribution(data.distribution);
      }
      if (data.totalPlayers) {
        setTotalPlayers(data.totalPlayers);
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to admin reveal answer event
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/admin/revealAnswer`, (message) => {
      console.log('✅ Admin triggered: Reveal correct answer', message.payload);
      const data = message.payload;
      setShowCorrectAnswer(true);
      setShowDistribution(true); // Ensure distribution is visible
      setShowWaitingForOthers(false); // Hide waiting screen
      // Store the revealed correct answer index if provided
      if (data && typeof data.correctIndex === 'number') {
        setRevealedCorrectIndex(data.correctIndex);
      }
      
      // NOW apply the pending score update and play sounds
      // This is the moment the result is revealed to the player
      if (pendingScoreUpdate.current) {
        const { totalMoney: newMoney, correct } = pendingScoreUpdate.current;
        setTotalMoney(newMoney);
        if (correct) {
          setCorrectAnswers(prev => prev + 1);
          playSound('correct');
        } else {
          playSound('wrong');
        }
        pendingScoreUpdate.current = null;
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  const ANSWER_BUTTON_CLASSES = [
    'btn-answer',
    'btn-answer',
    'btn-answer',
    'btn-answer',
  ];

  // Timer management for current question
  useEffect(() => {
    if (currentQuestion && !isAnswered) {
      const endTime = currentQuestion.endTime;
      const updateTimer = () => {
        const now = Date.now();
        const remaining = Math.max(0, Math.ceil((endTime - now) / 1000));
        const previousTime = timeLeft;
        setTimeLeft(remaining);
        
        // Play countdown sound for last 5 seconds
        if (remaining <= 5 && remaining > 0 && remaining !== previousTime) {
          playSound('countdown');
        }
        
        if (remaining <= 0) {
          handleTimeout();
        }
      };

      updateTimer();
      timerRef.current = setInterval(updateTimer, 100);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
  }, [currentQuestion, isAnswered]);

  // Show waiting screen when player has answered - with delay to show selected answer
  useEffect(() => {
    if (isAnswered && !showWaitingForOthers) {
      // Wait 2 seconds to show the selected answer before transitioning
      const timer = setTimeout(() => {
        setShowWaitingForOthers(true);
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isAnswered]);

  // 50/50 Lifeline: Eliminate 2 wrong answers via server
  const handleFiftyFifty = async () => {
    if (usedFiftyFifty || isAnswered || !currentQuestion) return;
    
    setUsedFiftyFifty(true);
    
    try {
      const response = await axios.post(`${API_URL}/api/lifeline/fifty-fifty`, {
        sessionId,
        questionId: currentQuestion.question.id
      });
      
      if (response.data.success && response.data.data.eliminatedIndices) {
        setEliminatedAnswers(response.data.data.eliminatedIndices);
        console.log('🎯 50/50 used: Eliminated answers', response.data.data.eliminatedIndices.map((i: number) => ANSWER_LETTERS[i]));
      }
    } catch (error) {
      console.error('Failed to use 50/50 lifeline:', error);
      // On error, still mark as used but don't eliminate
    }
  };

  // Ask AI Lifeline: Get AI's suggestion
  const handleAskAI = async () => {
    if (usedAskAI || isAnswered || !currentQuestion || isAskingAI) return;
    
    setUsedAskAI(true);
    setIsAskingAI(true);
    
    try {
      const response = await axios.post(`${API_URL}/api/lifeline/ask-ai`, {
        sessionId,
        question: currentQuestion.question.text,
        choices: currentQuestion.question.choices
      });
      
      if (response.data.success && response.data.data.suggestedIndex !== undefined) {
        setAiSuggestion(response.data.data.suggestedIndex);
        console.log('🤖 AI suggests:', ANSWER_LETTERS[response.data.data.suggestedIndex]);
      }
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);
    } finally {
      setIsAskingAI(false);
    }
  };

  const handleTimeout = () => {
    if (!isAnswered) {
      setIsAnswered(true);
      // Don't play wrong sound on timeout - wait for reveal to keep mystery
    }
  };

  const handleAnswerSelect = async (index: number) => {
    if (isAnswered || !currentQuestion) return;

    setSelectedAnswer(index);
    setIsAnswered(true);

    try {
      // Convert to seconds to match timeLimit units
      const timeTaken = (Date.now() - currentQuestion.startTime) / 1000;
      
      // Publish answer submitted event to Solace
      if (connected) {
        publish(`trivia/session/${sessionId}/player/${playerId}/answered`, {
          playerId,
          questionId: currentQuestion.question.id,
          choiceIndex: index,
          timeTaken,
          timestamp: Date.now()
        });
      }
      
      // Also send via HTTP as backup (server will handle deduplication)
      await axios.post(`${API_URL}/api/session/${sessionId}/answer`, {
        playerId,
        questionId: currentQuestion.question.id,
        choiceIndex: index,
        timeTaken,
        timestamp: Date.now()
      });
      
      // Play tick sound when answer is submitted
      playSound('tick');
    } catch (error) {
      console.error('Failed to submit answer:', error);
    }
  };

  if (waiting) {
    // Show break screen between rounds
    if (isOnBreak && sessionState === 'PAUSED') {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 relative z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center max-w-lg w-full"
          >
            <motion.div
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-8xl mb-6 drop-shadow-[0_0_15px_rgba(247,148,29,0.5)]"
            >
              ☕
            </motion.div>
            <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
              Break Time!
            </h2>
            <p className="text-orange-400 text-xl mb-6 drop-shadow-lg">
              {currentRound?.name && `${currentRound.name} completed`}
            </p>
            
            {nextRoundName && (
              <p className="text-gray-300 mb-6">
                Up next: <span className="text-orange-400 font-semibold">{nextRoundName}</span>
              </p>
            )}

            {/* Leaderboard during break */}
            {breakLeaderboard.length > 0 && (
              <div className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-2xl p-4 border-2 border-orange-500 shadow-[0_0_30px_rgba(255,149,0,0.4)] mb-6">
                <h3 className="text-lg font-semibold text-orange-400 mb-3">Current Standings</h3>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {breakLeaderboard.slice(0, 10).map((entry, idx) => (
                    <div 
                      key={entry.playerId} 
                      className={`flex justify-between items-center p-2 rounded ${
                        entry.playerId === playerId 
                          ? 'bg-orange-500/20 border border-orange-500/50' 
                          : 'bg-gray-800/50'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${idx < 3 ? 'text-orange-400' : 'text-gray-400'}`}>
                          {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                        </span>
                        <span className="text-white">{entry.nickname}</span>
                      </div>
                      <span className="text-orange-400 font-semibold">{formatMoney(entry.totalMoney)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Your winnings */}
            <div className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-2xl p-4 border-2 border-orange-500 shadow-[0_0_30px_rgba(255,149,0,0.4)]">
              <div className="text-sm font-semibold text-orange-400">Your Winnings</div>
              <div className="text-4xl font-black text-white mt-2 drop-shadow-lg">{formatMoney(totalMoney)}</div>
            </div>
            
            <p className="text-gray-400 mt-6 text-sm">
              Waiting for the host to start the next round...
            </p>
          </motion.div>
        </div>
      );
    }

    const waitingMessage = sessionState === 'LOBBY' 
      ? 'Waiting for game to start...'
      : sessionState === 'CLOSED'
      ? 'Game has ended!'
      : 'Waiting for next question...';

    const waitingEmoji = sessionState === 'LOBBY' ? '⏳' : sessionState === 'CLOSED' ? '🏆' : '⏱️';


    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            animate={{ rotate: sessionState === 'LOBBY' ? 360 : 0, scale: sessionState === 'LOBBY' ? 1 : [1, 1.1, 1] }}
            transition={sessionState === 'LOBBY' ? { duration: 2, repeat: Infinity, ease: "linear" } : { duration: 1, repeat: Infinity }}
            className="text-8xl mb-6 drop-shadow-[0_0_15px_rgba(247,148,29,0.5)]"
          >
            {waitingEmoji}
          </motion.div>
          <h2 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">
            {waitingMessage}
          </h2>
          <p className="text-orange-400 text-xl drop-shadow-lg">
            {sessionState === 'LOBBY' && 'The host will start the game soon!'}
            {sessionState === 'ACTIVE' && 'Get ready for the next question!'}
            {sessionState === 'CLOSED' && 'Check out the final leaderboard!'}
          </p>
          <motion.div
            className="mt-8 bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-2xl p-6 border-2 border-orange-500 shadow-[0_0_30px_rgba(255,149,0,0.4)]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="text-lg font-semibold text-orange-400">Your Winnings</div>
            <div className="text-5xl font-black text-white mt-2 drop-shadow-lg">{formatMoney(totalMoney)}</div>
            <div className="text-sm text-gray-400 mt-2">{correctAnswers} correct {correctAnswers === 1 ? 'answer' : 'answers'}</div>
          </motion.div>

          {/* Show View Leaderboard button when game is closed */}
          {sessionState === 'CLOSED' && (
            <motion.button
              onClick={() => navigate(`/results/${sessionId}`)}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-6 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold py-4 px-8 rounded-xl text-lg transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(255,149,0,0.5)]"
            >
              🏆 View Leaderboard
            </motion.button>
          )}
        </motion.div>
      </div>
    );
  }

  // Show "waiting for others" screen after answering
  if (showWaitingForOthers && isAnswered && !showDistribution) {
    const percentage = totalPlayers > 0 ? Math.round((answeredCount / totalPlayers) * 100) : 0;
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center max-w-md w-full"
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-8xl mb-6 drop-shadow-[0_0_15px_rgba(247,148,29,0.5)]"
          >
            ⏳
          </motion.div>
          <h2 className="text-3xl font-bold text-white mb-4 drop-shadow-lg">
            Waiting for Other Players
          </h2>
          <p className="text-orange-400 text-xl mb-8 drop-shadow-lg">
            {selectedAnswer !== null ? 'Answer submitted! Hang tight...' : 'Time\'s up! Waiting for others...'}
          </p>

          {/* Progress */}
          <div className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-2xl p-6 mb-6 border-2 border-orange-500 shadow-[0_0_30px_rgba(255,149,0,0.4)]">
            <div className="text-6xl font-black text-white mb-2 drop-shadow-lg">
              {answeredCount} / {totalPlayers}
            </div>
            <div className="text-orange-400 font-semibold mb-4">
              players answered
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-900 rounded-full h-4 overflow-hidden border border-orange-500/30">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5 }}
                className="h-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-[0_0_15px_rgba(255,149,0,0.6)]"
              />
            </div>
          </div>

          {/* Score */}
          <div className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy to-millionaire-blue-dark rounded-2xl p-6 border-2 border-orange-500 shadow-[0_0_30px_rgba(255,149,0,0.4)]">
            <div className="text-lg font-semibold text-orange-400">Your Winnings</div>
            <div className="text-5xl font-black text-white mt-2 drop-shadow-lg">{formatMoney(totalMoney)}</div>
            <div className="text-sm text-gray-400 mt-1">{correctAnswers} correct</div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Show answer distribution when admin triggers it
  if (showDistribution && currentQuestion) {
    const totalAnswers = Object.values(answerDistribution).reduce((a, b) => a + b, 0);
    
    // Convert answerDistribution to stats format expected by chart
    const stats = [0, 1, 2, 3].map((choiceIndex) => ({
      choiceIndex,
      count: answerDistribution[choiceIndex] || 0,
      percentage: totalAnswers > 0 ? ((answerDistribution[choiceIndex] || 0) / totalAnswers) * 100 : 0
    }));

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 relative z-10">
        <div className="max-w-4xl w-full">
          <AnswerDistributionChart
            questionText={currentQuestion.question.text}
            choices={currentQuestion.question.choices}
            correctIndex={showCorrectAnswer ? revealedCorrectIndex : null}
            stats={stats}
            totalResponses={totalAnswers}
            showCorrectAnswer={showCorrectAnswer}
            playerAnswer={selectedAnswer}
          />
          
          <div className="mt-6 text-center">
            <div className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy-light to-millionaire-blue rounded-xl p-4 border-2 border-millionaire-gold">
              <div className="text-lg font-semibold text-millionaire-gold">Your Winnings</div>
              <div className="text-4xl font-black text-white mt-1 drop-shadow-lg">{formatMoney(totalMoney)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Sticky Header - Solace Logo, Score, Timer, Sound Toggle */}
      <div className="sticky top-0 z-40 bg-gradient-to-b from-[#0D1B2A] via-[#0D1B2A] to-[#0D1B2A]/95 backdrop-blur-sm">
        {/* Sound Toggle - positioned in sticky header */}
        <SoundToggle />
        
        {/* Solace Logo Banner */}
        <div className="w-full bg-gradient-to-r from-millionaire-navy-dark/80 via-millionaire-navy/80 to-millionaire-navy-dark/80 border-b border-orange-500/30 px-6 py-2 flex-shrink-0">
          <img src="/solace-logo.svg" alt="Solace" className="h-5 md:h-6 opacity-80 hover:opacity-100 transition-opacity" />
        </div>

        {/* Header - Score & Timer */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex justify-between items-center p-4 pb-2"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-orange-500/20 blur-xl rounded-full"></div>
            <div className="relative px-2 md:px-6 py-1 md:py-3">
              <div className="text-xs md:text-sm text-orange-400 font-bold uppercase tracking-wider mb-1">Current Winnings</div>
              <div className="text-3xl md:text-5xl lg:text-6xl font-black bg-gradient-to-br from-orange-500 via-amber-500 to-orange-600 text-transparent bg-clip-text"
                   style={{ 
                     textShadow: '0 0 20px rgba(255,149,0,0.5)',
                     WebkitTextStroke: '1px rgba(255,149,0,0.3)'
                   }}>
                {formatMoney(totalMoney)}
              </div>
            </div>
          </div>

          {/* Timer with decorative ring */}
          <div className="relative">
            {/* Outer decorative ring */}
            <div className="absolute inset-0 -m-2">
              <svg className="w-full h-full" viewBox="0 0 100 100">
                <circle
                  cx="50" cy="50" r="46"
                  fill="none"
                  stroke="url(#timerGradient)"
                  strokeWidth="3"
                  className="opacity-60"
                />
                {/* Tick marks around the ring */}
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
                  <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
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
      </div>
      {/* End Sticky Header */}

      {/* Main Content */}
      <div className="flex-1 flex p-4 pb-20">
      <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full">
        {/* Lifelines - Premium WWTBAM Style */}
        {currentQuestion && !isAnswered && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-center gap-6 mb-6"
          >
            {/* 50/50 Lifeline */}
            <motion.button
              whileHover={{ scale: usedFiftyFifty ? 1 : 1.08 }}
              whileTap={{ scale: usedFiftyFifty ? 1 : 0.95 }}
              onClick={handleFiftyFifty}
              disabled={usedFiftyFifty || isAnswered}
              className="relative group"
            >
              {/* Outer glow ring */}
              <div className={`
                absolute inset-0 rounded-full transition-all duration-300
                ${usedFiftyFifty 
                  ? 'opacity-0' 
                  : 'bg-blue-500/30 blur-md group-hover:bg-blue-400/50 group-hover:blur-lg'
                }
              `} />
              
              {/* Main circle */}
              <div className={`
                relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center
                transition-all duration-300
                ${usedFiftyFifty
                  ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700'
                  : 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border-2 border-blue-400 shadow-[0_0_25px_rgba(59,130,246,0.4),inset_0_2px_10px_rgba(255,255,255,0.1)]'
                }
              `}>
                {/* Inner metallic effect */}
                <div className={`
                  absolute inset-1 rounded-full 
                  ${usedFiftyFifty 
                    ? 'bg-gradient-to-br from-gray-700 to-gray-800' 
                    : 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800'
                  }
                `} />
                
                {/* Icon */}
                <div className={`
                  relative z-10 font-black text-xl md:text-2xl tracking-tight
                  ${usedFiftyFifty ? 'text-gray-600' : 'text-white'}
                `}
                  style={{ textShadow: usedFiftyFifty ? 'none' : '0 2px 8px rgba(0,0,0,0.8)' }}
                >
                  50:50
                </div>
                
                {/* Used overlay */}
                {usedFiftyFifty && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Label */}
              <div className={`
                mt-1 text-xs font-semibold text-center tracking-wide
                ${usedFiftyFifty ? 'text-gray-600' : 'text-blue-300'}
              `}>
                50/50
              </div>
            </motion.button>

            {/* Ask AI Lifeline */}
            <motion.button
              whileHover={{ scale: usedAskAI ? 1 : 1.08 }}
              whileTap={{ scale: usedAskAI ? 1 : 0.95 }}
              onClick={handleAskAI}
              disabled={usedAskAI || isAnswered || isAskingAI}
              className="relative group"
            >
              {/* Outer glow ring */}
              <div className={`
                absolute inset-0 rounded-full transition-all duration-300
                ${usedAskAI 
                  ? 'opacity-0' 
                  : 'bg-purple-500/30 blur-md group-hover:bg-purple-400/50 group-hover:blur-lg'
                }
              `} />
              
              {/* Main circle */}
              <div className={`
                relative w-16 h-16 md:w-20 md:h-20 rounded-full flex items-center justify-center
                transition-all duration-300
                ${usedAskAI
                  ? 'bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-gray-700'
                  : 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 border-2 border-purple-400 shadow-[0_0_25px_rgba(147,51,234,0.4),inset_0_2px_10px_rgba(255,255,255,0.1)]'
                }
              `}>
                {/* Inner metallic effect */}
                <div className={`
                  absolute inset-1 rounded-full 
                  ${usedAskAI 
                    ? 'bg-gradient-to-br from-gray-700 to-gray-800' 
                    : 'bg-gradient-to-br from-slate-600 via-slate-700 to-slate-800'
                  }
                `} />
                
                {/* Icon */}
                <div className="relative z-10">
                  {isAskingAI ? (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    >
                      <svg className="w-8 h-8 md:w-10 md:h-10 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </motion.div>
                  ) : (
                    <svg className={`w-8 h-8 md:w-10 md:h-10 ${usedAskAI ? 'text-gray-600' : 'text-white'}`} fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 2a2 2 0 012 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 017 7h1a1 1 0 011 1v3a1 1 0 01-1 1h-1v1a2 2 0 01-2 2H5a2 2 0 01-2-2v-1H2a1 1 0 01-1-1v-3a1 1 0 011-1h1a7 7 0 017-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 012-2zm-4 9a1 1 0 100 2 1 1 0 000-2zm8 0a1 1 0 100 2 1 1 0 000-2zm-4 4a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
                    </svg>
                  )}
                </div>
                
                {/* Used overlay */}
                {usedAskAI && !isAskingAI && (
                  <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                    <svg className="w-8 h-8 text-red-500/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                )}
              </div>
              
              {/* Label */}
              <div className={`
                mt-1 text-xs font-semibold text-center tracking-wide
                ${usedAskAI ? 'text-gray-600' : 'text-purple-300'}
              `}>
                Ask AI
              </div>
            </motion.button>
          </motion.div>
        )}

        {/* Mobile Money Ladder - Condensed Horizontal */}
        {currentQuestion && (
          <div className="xl:hidden mb-4">
            <div className="flex items-center justify-center gap-1 overflow-x-auto py-2 px-1">
              {MONEY_LADDER.slice(0, currentQuestion.totalQuestions).map((level, index) => {
                const levelNum = index + 1;
                const isCurrent = levelNum === currentQuestion.questionNumber;
                const isPassed = levelNum < currentQuestion.questionNumber;
                const isMilestone = level.milestone;
                
                return (
                  <div
                    key={level.level}
                    className={`
                      flex-shrink-0 px-2 py-1 text-xs font-bold rounded transition-all
                      ${isCurrent 
                        ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-[0_0_15px_rgba(255,149,0,0.7)] scale-110 border border-orange-300' 
                        : isPassed
                          ? 'bg-gray-800/50 text-gray-500'
                          : isMilestone
                            ? 'bg-blue-900/80 text-orange-400 border border-orange-500/50'
                            : 'bg-millionaire-navy-dark/50 text-gray-400'
                      }
                    `}
                  >
                    {formatMoneyLadder(level.amount)}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      {/* Question */}
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
                {formatMoneyLadder(MONEY_LADDER[currentQuestion.questionNumber - 1]?.amount || 0)}
              </div>
            </div>

            {/* Question Text - Premium WWTBAM Hexagonal Box with Gold Border */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="relative mb-8 px-[6%]"
            >
              {/* Extending lines OUTSIDE hexagon - Left */}
              <div 
                className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] z-10"
                style={{
                  width: '6%',
                  background: 'linear-gradient(to right, transparent 0%, #FFB81C 70%, #F7941D 100%)',
                  boxShadow: '0 0 10px rgba(247, 148, 29, 0.6)'
                }}
              />
              {/* Extending lines OUTSIDE hexagon - Right */}
              <div 
                className="absolute right-0 top-1/2 -translate-y-1/2 h-[3px] z-10"
                style={{
                  width: '6%',
                  background: 'linear-gradient(to left, transparent 0%, #FFB81C 70%, #F7941D 100%)',
                  boxShadow: '0 0 10px rgba(247, 148, 29, 0.6)'
                }}
              />
              
              {/* Question container with very pronounced hexagonal shape and GOLD border */}
              <div 
                className="relative bg-gradient-to-r from-blue-950 via-blue-900 to-blue-950 px-8 py-5 md:px-12 md:py-6 lg:px-16 lg:py-7"
                style={{
                  clipPath: 'polygon(5% 0%, 95% 0%, 100% 50%, 95% 100%, 5% 100%, 0% 50%)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.7), 0 0 25px rgba(247, 148, 29, 0.3), inset 0 2px 0 rgba(255,255,255,0.1), inset 0 -2px 0 rgba(0,0,0,0.5)'
                }}
              >
                {/* Gold border overlay using pseudo-approach */}
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    clipPath: 'polygon(5% 0%, 95% 0%, 100% 50%, 95% 100%, 5% 100%, 0% 50%)',
                    border: '3px solid #F7941D',
                    boxShadow: 'inset 0 0 15px rgba(247, 148, 29, 0.3)'
                  }}
                />
                
                {/* Subtle grid pattern overlay */}
                <div className="absolute inset-0 opacity-[0.07] pointer-events-none" 
                     style={{
                       backgroundImage: 'linear-gradient(0deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(255, 255, 255, .05) 25%, rgba(255, 255, 255, .05) 26%, transparent 27%, transparent 74%, rgba(255, 255, 255, .05) 75%, rgba(255, 255, 255, .05) 76%, transparent 77%, transparent)',
                       backgroundSize: '40px 40px'
                     }}
                />
                
                <h2 className="text-lg md:text-xl lg:text-2xl font-bold text-white text-center relative z-10 leading-snug"
                    style={{ textShadow: '0 3px 8px rgba(0,0,0,0.6), 0 0 20px rgba(59,130,246,0.3)' }}>
                  {currentQuestion.question.text}
                </h2>
              </div>
            </motion.div>

            {/* Answer Choices - 2x2 Grid Premium WWTBAM Style - Touching side by side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 md:gap-y-4 gap-x-0 mb-6 px-[4%]">
              {currentQuestion.question.choices.map((choice, index) => {
                const isEliminated = eliminatedAnswers.includes(index);
                const isAISuggested = aiSuggestion === index;
                
                return (
                  <motion.button
                    key={index}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ 
                      opacity: isEliminated ? 0.3 : 1, 
                      scale: isEliminated ? 0.95 : 1 
                    }}
                    transition={{ delay: 0.6 + (index * 0.1), duration: 0.4 }}
                    whileHover={{ scale: isAnswered || isEliminated ? 1 : 1.02 }}
                    whileTap={{ scale: isAnswered || isEliminated ? 1 : 0.98 }}
                    onClick={() => !isEliminated && handleAnswerSelect(index)}
                    disabled={isAnswered || isEliminated}
                    className={`
                      ${ANSWER_BUTTON_CLASSES[index]} 
                      ${isAnswered && selectedAnswer === index ? 'selected' : ''} 
                      ${isAnswered && selectedAnswer !== index ? 'opacity-50' : ''}
                      ${isEliminated ? 'grayscale cursor-not-allowed' : ''}
                      ${isAISuggested && !isAnswered ? 'ring-4 ring-purple-400 shadow-[0_0_30px_rgba(147,51,234,0.7)]' : ''}
                    `}
                  >
                    <div className="flex items-center relative">
                      {isAISuggested && !isAnswered && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="absolute -top-2 -right-2 bg-purple-500 text-white text-xs px-2 py-0.5 rounded-full font-bold shadow-lg z-10"
                        >
                          AI
                        </motion.span>
                      )}
                      <span className="answer-letter">
                        {ANSWER_LETTERS[index]}
                      </span>
                      <span className="flex-1 text-left">
                        {isEliminated ? <s className="text-gray-500">{choice}</s> : choice}
                      </span>
                      {isEliminated && (
                        <span className="text-red-500 font-bold text-xl ml-2">✕</span>
                      )}
                    </div>
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>
      
      {/* Money Ladder - Right Side */}
      {currentQuestion && (
        <div className="hidden xl:block w-56 ml-6">
          <MoneyLadder 
            currentQuestion={currentQuestion.questionNumber} 
            totalQuestions={currentQuestion.totalQuestions}
            questionResults={questionResults}
            className="sticky top-4"
          />
        </div>
      )}
    </div>

      {/* Footer Credit */}
      <div className="fixed bottom-safe right-4 z-50 flex items-center gap-2 text-[#2DD4BF] text-sm bg-[#0D1B2A]/80 backdrop-blur-sm px-3 py-1.5 rounded-full">
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
