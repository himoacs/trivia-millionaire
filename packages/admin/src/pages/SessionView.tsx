import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { Player, Question, Answer, Round } from '@trivia-millionaire/shared';
import { getAvatarEmoji } from '@trivia-millionaire/shared';
import SolaceDebugPanel from '../components/SolaceDebugPanel';
import SolaceStatusIndicator from '../components/SolaceStatusIndicator';
import ManualQuestionModal from '../components/ManualQuestionModal';
import AIGenerateModal from '../components/AIGenerateModal';
import AdminSettingsModal from '../components/AdminSettingsModal';
import RoundManager from '../components/RoundManager';
import { useSolace } from '../hooks/useSolace';

const API_URL = import.meta.env.VITE_API_URL || '';
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:4849';

export default function SessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionState, setSessionState] = useState<'LOBBY' | 'ACTIVE' | 'PAUSED' | 'CLOSED'>('LOBBY');
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRoundIndex, setCurrentRoundIndex] = useState(-1);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showManualQuestionModal, setShowManualQuestionModal] = useState(false);
  const [showAIGenerateModal, setShowAIGenerateModal] = useState(false);
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{ question: Question; index: number } | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [showAnswerDistribution, setShowAnswerDistribution] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [allAnswered, setAllAnswered] = useState(false);
  const [answerCounts, setAnswerCounts] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const [questionTimerEnd, setQuestionTimerEnd] = useState<number | null>(null);

  // Connect to Solace
  const { connected, subscribe, publish } = useSolace();

  // Subscribe to player joined events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/player/*/joined`, (message) => {
      console.log('👥 Player joined:', message.payload);
      const newPlayer = message.payload;
      setPlayers(prev => {
        // Check if player already exists
        const exists = prev.some(p => p.id === newPlayer.id);
        if (exists) return prev;
        return [...prev, newPlayer];
      });
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to answer submitted events
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/player/*/answered`, (message) => {
      const answer = message.payload as Answer;
      console.log('📝 Answer submitted:', answer);
      
      // Increment answer count for this choice
      setAnswerCounts(prev => ({
        ...prev,
        [answer.choiceIndex]: (prev[answer.choiceIndex] || 0) + 1
      }));

      // Update answered count
      setAnsweredCount(prev => prev + 1);
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Subscribe to answer stats updates (from server aggregation)
  useEffect(() => {
    if (!connected || !sessionId) return;

    const unsubscribe = subscribe(`trivia/session/${sessionId}/stats/answersUpdated`, (message) => {
      const stats = message.payload;
      console.log('📊 Answer stats updated:', stats);
      setAnsweredCount(stats.answeredCount);
      setAllAnswered(stats.allAnswered);
      if (stats.distribution) {
        setAnswerCounts(stats.distribution);
      }
    });

    return unsubscribe;
  }, [connected, sessionId, subscribe]);

  // Load session data initially
  useEffect(() => {
    loadSessionData();
  }, [sessionId]);

  const loadSessionData = async () => {
    try {
      // Fetch session details from the API
      const response = await axios.get(`${API_URL}/api/admin/session/${sessionId}`);
      
      if (response.data.success) {
        const sessionData = response.data.data;
        setSessionCode(sessionData.code);
        setSessionName(sessionData.name);
        setSessionState(sessionData.state || 'LOBBY');
        
        // Ensure players is always an array
        const playersArray = Array.isArray(sessionData.players) 
          ? sessionData.players 
          : [];
        setPlayers(playersArray);
        
        // Always sync questions from server (server is source of truth)
        if (sessionData.questions) {
          setQuestions(sessionData.questions);
        }
        
        // Update current question index from server
        if (sessionData.currentQuestionIndex !== undefined) {
          setCurrentQuestionIndex(sessionData.currentQuestionIndex);
        }

        // Load rounds data
        if (sessionData.rounds) {
          setRounds(sessionData.rounds);
        }
        if (sessionData.currentRoundIndex !== undefined) {
          setCurrentRoundIndex(sessionData.currentRoundIndex);
        }
        
        // Store in localStorage for backup
        localStorage.setItem(`session_${sessionId}_code`, sessionData.code);
        localStorage.setItem(`session_${sessionId}_name`, sessionData.name);
      }
    } catch (error) {
      console.error('Failed to load session data:', error);
      
      // Fallback to localStorage
      const storedCode = localStorage.getItem(`session_${sessionId}_code`);
      const storedName = localStorage.getItem(`session_${sessionId}_name`);
      
      if (storedCode && storedName) {
        setSessionCode(storedCode);
        setSessionName(storedName);
      } else {
        setSessionCode('LOADING');
        setSessionName('Loading...');
      }
    }
  };

  const handleAIGenerate = async (topic: string, count: number, docs?: string): Promise<Question[]> => {
    try {
      const response = await axios.post(
        `${API_URL}/api/admin/session/${sessionId}/questions/generate`,
        {
          count,
          topic,
          docs,
          category: 'general',
          difficulty: 'medium'
        }
      );

      if (response.data.success) {
        return response.data.data.questions;
      }
      throw new Error('Failed to generate questions');
    } catch (error: any) {
      console.error('Failed to generate questions:', error);
      throw new Error(error.response?.data?.error || error.response?.data?.message || 'Failed to generate questions');
    }
  };

  const handleSaveAIQuestions = async (aiQuestions: Question[]) => {
    try {
      // Send questions to backend
      await axios.post(
        `${API_URL}/api/admin/session/${sessionId}/questions`,
        { questions: aiQuestions }
      );
      
      // Reload data from server (source of truth) to avoid duplicates
      await loadSessionData();
      setShowAIGenerateModal(false);
    } catch (error) {
      console.error('Failed to save AI questions:', error);
      alert('Failed to save questions to the server');
    }
  };

  const handleSaveManualQuestion = async (newQuestions: Question[]) => {
    try {
      if (editingQuestion !== null) {
        // Editing existing question - update the question on the server
        const updated = [...questions];
        updated[editingQuestion.index] = newQuestions[0];
        
        // Send all questions to backend (replace all)
        await axios.post(
          `${API_URL}/api/admin/session/${sessionId}/questions`,
          { questions: updated }
        );
        
        setQuestions(updated);
        setEditingQuestion(null);
      } else {
        // Adding new question(s) - send to backend
        await axios.post(
          `${API_URL}/api/admin/session/${sessionId}/questions`,
          { questions: newQuestions }
        );
        
        // Reload from server to avoid duplicates
        await loadSessionData();
      }
      setShowManualQuestionModal(false);
    } catch (error) {
      console.error('Failed to save manual question:', error);
      alert('Failed to save question to the server');
    }
  };

  const handleStartGame = async () => {
    try {
      // Only start the session if it's in LOBBY state
      // If already ACTIVE (starting a new round), just release the question
      if (sessionState === 'LOBBY') {
        await axios.post(`${API_URL}/api/admin/session/${sessionId}/start`);
      }
      
      // Release the first question of the current round
      const releaseResponse = await axios.post(`${API_URL}/api/admin/session/${sessionId}/release-question`);
      
      // Get the released question info from server response
      const releasedQuestion = releaseResponse.data.data?.question;
      const questionNumber = releasedQuestion?.questionNumber ?? 1;
      
      // Set to the correct global question index (server-provided)
      setCurrentQuestionIndex(questionNumber - 1);
      setSessionState('ACTIVE');
      
      // Reset answer distribution
      setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
      setShowAnswerDistribution(false);
      setShowCorrectAnswer(false);
      setAnsweredCount(0);
      setAllAnswered(false);
      
      // Set timer to show distribution when question ends
      const currentQ = questions[questionNumber - 1];
      if (currentQ) {
        const endTime = Date.now() + (currentQ.timeLimit * 1000);
        setQuestionTimerEnd(endTime);
      }
    } catch (error) {
      console.error('Failed to start game:', error);
      alert('Failed to start game. Make sure you have added questions.');
    }
  };

  const handleReleaseQuestion = async () => {
    try {
      await axios.post(
        `${API_URL}/api/admin/session/${sessionId}/release-question`
      );
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      
      // Reset answer distribution
      setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
      setShowAnswerDistribution(false);
      setShowCorrectAnswer(false);
      setAnsweredCount(0);
      setAllAnswered(false);
      
      // Set timer to show distribution when question ends
      if (questions[nextIndex]) {
        const endTime = Date.now() + (questions[nextIndex].timeLimit * 1000);
        setQuestionTimerEnd(endTime);
      }
    } catch (error) {
      console.error('Failed to release question:', error);
      alert('Failed to release next question.');
    }
  };
  const handleShowResults = () => {
    setShowAnswerDistribution(true);
    
    // Publish event to show distribution to all players (including Presenter view)
    if (connected && sessionId) {
      console.log('Publishing show distribution:', {
        questionIndex: currentQuestionIndex,
        distribution: answerCounts,
        totalPlayers: players.length
      });
      publish(`trivia/session/${sessionId}/admin/showDistribution`, {
        questionIndex: currentQuestionIndex,
        distribution: answerCounts,
        totalPlayers: players.length
      });
    }
  };

  const handleRevealCorrectAnswer = () => {
    setShowCorrectAnswer(true);
    
    // Get current round's questions to find the correct answer
    const currentRound = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
    let correctIndex = 0;
    
    if (currentRound && currentQuestionIndex >= 0) {
      // Get the question from the current round
      const questionId = currentRound.questionIds[currentQuestionIndex];
      const question = questions.find(q => q.id === questionId);
      if (question) {
        correctIndex = question.correctIndex;
      }
    } else if (currentQuestionIndex >= 0 && questions[currentQuestionIndex]) {
      // Fallback for flat question list
      correctIndex = questions[currentQuestionIndex].correctIndex;
    }
    
    // Publish event to reveal correct answer to all players (including Presenter view)
    if (connected && sessionId) {
      console.log('Publishing reveal answer:', {
        questionIndex: currentQuestionIndex,
        correctIndex
      });
      publish(`trivia/session/${sessionId}/admin/revealAnswer`, {
        questionIndex: currentQuestionIndex,
        correctIndex
      });
    }
  };
  
  // Note: Timer expiry now just enables the "Show Distribution" button in RoundManager
  // Admin must manually click the button to show distribution

  const handleCloseSession = async () => {
    const unreleasedQuestions = questions.length - (currentQuestionIndex + 1);
    const isEarlyEnd = unreleasedQuestions > 0;
    
    const message = isEarlyEnd
      ? `Are you sure you want to END THE GAME EARLY?\n\n⚠️ Warning: There are ${unreleasedQuestions} unreleased question(s) remaining.\n\nThis will immediately end the game and show the final leaderboard to all players. This action cannot be undone.`
      : 'Are you sure you want to close this session?\n\nThis will end the game and show the final leaderboard to all players. This action cannot be undone.';
    
    const confirmed = window.confirm(message);
    
    if (!confirmed) return;
    
    try {
      await axios.post(`${API_URL}/api/admin/session/${sessionId}/close`);
      setSessionState('CLOSED');
      alert('Session closed! Leaderboard sent to all players.');
    } catch (error) {
      console.error('Failed to close session:', error);
      alert('Failed to close session.');
    }
  };

  // Jump to a specific question within the current round
  const handleJumpToQuestion = async (questionIndex: number) => {
    const confirmed = window.confirm(`Jump to Question ${questionIndex + 1}? This will immediately release that question to all players.`);
    if (!confirmed) return;
    
    try {
      const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/jump-to-question`, {
        questionIndex
      });
      
      if (response.data.success) {
        setCurrentQuestionIndex(questionIndex);
        setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
        setShowAnswerDistribution(false);
        setShowCorrectAnswer(false);
        setAnsweredCount(0);
        setAllAnswered(false);
        
        // Set timer - find the question from the round's questionIds
        const currentRound = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
        if (currentRound && currentRound.questionIds[questionIndex]) {
          const questionId = currentRound.questionIds[questionIndex];
          const question = questions.find(q => q.id === questionId);
          if (question) {
            const endTime = Date.now() + (question.timeLimit * 1000);
            setQuestionTimerEnd(endTime);
          }
        }
      }
    } catch (error) {
      console.error('Failed to jump to question:', error);
      alert('Failed to jump to question.');
    }
  };

  // Skip to a different round (abort current round and start another)
  const handleSkipToRound = async (targetRoundIndex: number) => {
    const targetRound = rounds[targetRoundIndex];
    const confirmed = window.confirm(
      `Skip to "${targetRound?.name || 'Round ' + (targetRoundIndex + 1)}"?\n\n` +
      `This will end the current round early and start the selected round.`
    );
    if (!confirmed) return;
    
    try {
      const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/skip-to-round`, {
        targetRoundIndex
      });
      
      if (response.data.success) {
        // Reset state for new round
        setCurrentRoundIndex(targetRoundIndex);
        setCurrentQuestionIndex(-1);
        setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
        setShowAnswerDistribution(false);
        setShowCorrectAnswer(false);
        setAnsweredCount(0);
        setAllAnswered(false);
        setQuestionTimerEnd(null);
        
        // Reload session data
        await loadSessionData();
      }
    } catch (error) {
      console.error('Failed to skip to round:', error);
      alert('Failed to skip to round.');
    }
  };

  const joinUrl = `${CLIENT_URL}/?code=${sessionCode}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Banner */}
      <div className="w-full bg-gradient-to-r from-millionaire-navy-dark via-millionaire-dark to-millionaire-navy-dark border-b border-millionaire-gold/30 px-4 md:px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Logo + Navigation */}
          <div className="flex items-center gap-2">
            <img src="/solace-logo.svg" alt="Solace" className="h-6 md:h-8 opacity-80 hover:opacity-100 transition-opacity" />
            <div className="btn-divider hidden md:block" />
            <button
              onClick={() => navigate('/dashboard')}
              className="btn-tertiary btn-sm"
              title="Back to Dashboard"
              aria-label="Back to Dashboard"
            >
              <span className="md:hidden">←</span>
              <span className="hidden md:inline">← Dashboard</span>
            </button>
          </div>
          
          {/* Center: Primary Actions */}
          <div className="flex items-center">
            <div className="btn-group">
              <button
                onClick={() => window.open(`/presenter/${sessionId}`, '_blank', 'width=1920,height=1080')}
                className="btn-success btn-sm"
                title="Open Presenter View in new window"
                aria-label="Open Presenter View"
              >
                <span>🖥️</span>
                <span className="hidden md:inline">Presenter</span>
              </button>
              <button
                onClick={() => setShowAdminSettingsModal(true)}
                className="btn-ai btn-sm"
                title="Configure AI settings for question generation"
                aria-label="AI Settings"
              >
                <span>⚙️</span>
                <span className="hidden md:inline">AI Settings</span>
              </button>
              <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={`btn-sm ${showDebugPanel ? 'btn-warning' : 'btn-ghost'}`}
                title="Toggle Solace message debug panel"
                aria-label="Toggle Solace debug panel"
              >
                <span>📡</span>
                <span className="hidden md:inline">{showDebugPanel ? 'Hide' : 'Show'} Solace</span>
              </button>
            </div>
          </div>
          
          {/* Right: Connection Status */}
          <SolaceStatusIndicator />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1">
        {/* Main Content */}
        <div className={`flex-1 p-6 transition-all duration-300`}>
          <div className="max-w-7xl mx-auto">
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6"
            >
              <div className="flex items-center justify-between">
                <div>
                <h1 className="text-4xl font-bold text-white mb-2 drop-shadow-lg">{sessionName}</h1>
                <p className="text-millionaire-gold drop-shadow-lg">Session Code: <span className="font-mono text-3xl">{sessionCode}</span></p>
              </div>
              <div className="flex flex-col items-end space-y-2">
                <span className={`px-4 py-2 rounded-full text-sm font-bold ${
                  sessionState === 'LOBBY' ? 'bg-blue-500 text-white' :
                  sessionState === 'ACTIVE' ? 'bg-green-500 text-white' :
                  sessionState === 'PAUSED' ? 'bg-yellow-500 text-white' :
                  'bg-red-500 text-white'
                }`}>
                  {sessionState === 'LOBBY' ? '📋 Lobby' :
                   sessionState === 'ACTIVE' ? '🎮 Active Game' :
                   sessionState === 'PAUSED' ? '☕ Break' :
                   '🏁 Closed'}
                </span>
                {currentQuestionIndex >= 0 && (
                  <span className="text-millionaire-gold font-semibold drop-shadow-lg">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                )}
                {currentRoundIndex >= 0 && rounds[currentRoundIndex] && (
                  <span className="text-purple-400 font-semibold drop-shadow-lg">
                    {rounds[currentRoundIndex].name} (Round {currentRoundIndex + 1}/{rounds.length})
                  </span>
                )}
              </div>
            </div>
          </motion.div>

        {/* LOBBY Layout: 2 columns - QR/Players (narrow) + Rounds (wide) */}
        {sessionState === 'LOBBY' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column: QR Code & Players */}
            <div className="space-y-6">
              {/* QR Code */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="card text-center"
              >
                <h2 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Scan to Join
                </h2>
                <div className="bg-millionaire-dark p-4 rounded-lg inline-block border-2 border-millionaire-gold">
                  <QRCodeSVG value={joinUrl} size={160} />
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  Or visit: <br />
                  <code className="text-millionaire-gold break-all text-xs">{CLIENT_URL}</code>
                </p>
              </motion.div>

              {/* Players */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="card"
              >
                <h2 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Players ({players.length})
                </h2>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  <AnimatePresence>
                    {players.map((player) => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center space-x-3 p-3 bg-millionaire-navy-dark/50 rounded-lg border border-millionaire-blue-dark/50"
                      >
                        <div className="text-2xl">{getAvatarEmoji(player.avatar)}</div>
                        <div className="flex-1">
                          <div className="font-semibold text-white">{player.nickname}</div>
                          <div className="text-sm text-gray-400">
                            Score: {player.score}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {players.length === 0 && (
                    <p className="text-gray-400 text-center py-4">
                      Waiting for players...
                    </p>
                  )}
                </div>
              </motion.div>
            </div>

            {/* Right Column: Rounds Management (spans 3 cols) */}
            <div className="lg:col-span-3">
              {sessionId && (
                <RoundManager
                  sessionId={sessionId}
                  questions={questions}
                  sessionState={sessionState}
                  currentRoundIndex={currentRoundIndex}
                  onRoundStarted={(round) => {
                    setSessionState('ACTIVE');
                    setCurrentRoundIndex(rounds.findIndex(r => r.id === round.id));
                    // Reset game state for the new round
                    setCurrentQuestionIndex(-1);
                    setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
                    setShowAnswerDistribution(false);
                    setShowCorrectAnswer(false);
                    setAnsweredCount(0);
                    setAllAnswered(false);
                    setQuestionTimerEnd(null);
                    loadSessionData();
                  }}
                  onRoundEnded={(_round, _leaderboard) => {
                    setSessionState('PAUSED');
                    loadSessionData();
                  }}
                  onRoundsChanged={(newRounds) => {
                    setRounds(newRounds);
                  }}
                  onQuestionsChanged={() => {
                    loadSessionData();
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* ACTIVE/PAUSED/CLOSED Layout: Same as LOBBY - QR/Players left, Rounds right */}
        {sessionState !== 'LOBBY' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Column: QR Code & Players */}
            <div className="space-y-6">
              {/* QR Code */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="card text-center"
              >
                <h2 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Scan to Join
                </h2>
                <div className="bg-millionaire-dark p-4 rounded-lg inline-block border-2 border-millionaire-gold">
                  <QRCodeSVG value={joinUrl} size={160} />
                </div>
                <p className="mt-4 text-sm text-gray-400">
                  Or visit: <br />
                  <code className="text-millionaire-gold break-all text-xs">{CLIENT_URL}</code>
                </p>
              </motion.div>

              {/* Players */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="card"
              >
                <h2 className="text-xl font-bold text-white mb-4 drop-shadow-lg">
                  Players ({players.length})
                </h2>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  <AnimatePresence>
                    {players.map((player) => (
                      <motion.div
                        key={player.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="flex items-center space-x-3 p-3 bg-millionaire-navy-dark/50 rounded-lg border border-millionaire-blue-dark/50"
                      >
                        <div className="text-2xl">{getAvatarEmoji(player.avatar)}</div>
                        <div className="flex-1">
                          <div className="font-semibold text-white">{player.nickname}</div>
                          <div className="text-sm text-gray-400">
                            Score: {player.score}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {players.length === 0 && (
                    <p className="text-gray-400 text-center py-4">
                      Waiting for players...
                    </p>
                  )}
                </div>
              </motion.div>

              {/* Session Closed Notice */}
              {sessionState === 'CLOSED' && (
                <div className="bg-red-500/20 border-2 border-red-500 rounded-lg p-4">
                  <div className="flex items-center space-x-2 text-red-300">
                    <span className="text-2xl">🏁</span>
                    <div>
                      <p className="font-bold text-lg">Game Closed</p>
                      <p className="text-sm">This session has ended.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Rounds Management with Game Controls (spans 3 cols) */}
            <div className="lg:col-span-3">
              {sessionId && (
                <RoundManager
                  sessionId={sessionId}
                  questions={questions}
                  sessionState={sessionState}
                  currentRoundIndex={currentRoundIndex}
                  onRoundStarted={(round) => {
                    setSessionState('ACTIVE');
                    setCurrentRoundIndex(rounds.findIndex(r => r.id === round.id));
                    // Reset game state for the new round
                    setCurrentQuestionIndex(-1);
                    setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
                    setShowAnswerDistribution(false);
                    setShowCorrectAnswer(false);
                    setAnsweredCount(0);
                    setAllAnswered(false);
                    setQuestionTimerEnd(null);
                    loadSessionData();
                  }}
                  onRoundEnded={(_round, _leaderboard) => {
                    setSessionState('PAUSED');
                    loadSessionData();
                  }}
                  onRoundsChanged={(newRounds) => {
                    setRounds(newRounds);
                  }}
                  onQuestionsChanged={() => {
                    loadSessionData();
                  }}
                  gameState={{
                    currentQuestionIndex,
                    answeredCount,
                    totalPlayers: players.length,
                    allAnswered,
                    showAnswerDistribution,
                    showCorrectAnswer,
                    answerCounts,
                    questionTimerEnd
                  }}
                  gameHandlers={{
                    onStartGame: handleStartGame,
                    onShowResults: handleShowResults,
                    onRevealAnswer: handleRevealCorrectAnswer,
                    onNextQuestion: handleReleaseQuestion,
                    onSkipQuestion: handleReleaseQuestion,
                    onCloseSession: handleCloseSession,
                    onJumpToQuestion: handleJumpToQuestion,
                    onSkipToRound: handleSkipToRound
                  }}
                />
              )}
            </div>
          </div>
        )}

        {/* Manual Question Modal */}
        <AnimatePresence>
          {showManualQuestionModal && (
            <ManualQuestionModal
              onClose={() => {
                setShowManualQuestionModal(false);
                setEditingQuestion(null);
              }}
              onSave={handleSaveManualQuestion}
              editQuestion={editingQuestion?.question}
            />
          )}
        </AnimatePresence>

        {/* AI Generate Modal */}
        <AnimatePresence>
          {showAIGenerateModal && (
            <AIGenerateModal
              onClose={() => setShowAIGenerateModal(false)}
              onGenerate={handleAIGenerate}
              onSave={handleSaveAIQuestions}
            />
          )}
        </AnimatePresence>

        {/* Admin Settings Modal */}
        <AnimatePresence>
          {showAdminSettingsModal && sessionId && (
            <AdminSettingsModal
              sessionId={sessionId}
              onClose={() => setShowAdminSettingsModal(false)}
            />
          )}
        </AnimatePresence>
      </div>
      </div>
      </div>

      {/* Solace Debug Panel - Side Panel */}
      <AnimatePresence>
        {showDebugPanel && (
          <SolaceDebugPanel 
            sessionId={sessionId!} 
            onClose={() => setShowDebugPanel(false)}
          />
        )}
      </AnimatePresence>

      {/* Footer Credit Bar */}
      <div className="mt-auto w-full bg-millionaire-navy-dark/90 backdrop-blur-sm border-t border-millionaire-gold/20 flex-shrink-0">
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
