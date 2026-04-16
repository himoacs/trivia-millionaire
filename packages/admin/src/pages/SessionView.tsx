import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { Player, Question, Answer } from '@trivia-millionaire/shared';
import { getAvatarEmoji } from '@trivia-millionaire/shared';
import SolaceDebugPanel from '../components/SolaceDebugPanel';
import SolaceStatusIndicator from '../components/SolaceStatusIndicator';
import ManualQuestionModal from '../components/ManualQuestionModal';
import AIGenerateModal from '../components/AIGenerateModal';
import AdminSettingsModal from '../components/AdminSettingsModal';
import AnswerDistributionChart from '../components/AnswerDistributionChart';
import { useSolace } from '../hooks/useSolace';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CLIENT_URL = import.meta.env.VITE_CLIENT_URL || 'http://localhost:5173';

export default function SessionView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [sessionCode, setSessionCode] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionState, setSessionState] = useState<'LOBBY' | 'ACTIVE' | 'CLOSED'>('LOBBY');
  const [players, setPlayers] = useState<Player[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const [showManualQuestionModal, setShowManualQuestionModal] = useState(false);
  const [showAIGenerateModal, setShowAIGenerateModal] = useState(false);
  const [showAdminSettingsModal, setShowAdminSettingsModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<{ question: Question; index: number } | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [showAnswerDistribution, setShowAnswerDistribution] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [allAnswered, setAllAnswered] = useState(false);
  const [answerCounts, setAnswerCounts] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0, 3: 0 });
  const [questionTimerEnd, setQuestionTimerEnd] = useState<number | null>(null);
  const [hideQuestions, setHideQuestions] = useState(false);

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

  const handleAddManualQuestion = () => {
    setEditingQuestion(null);
    setShowManualQuestionModal(true);
  };

  const handleGenerateAI = () => {
    setShowAIGenerateModal(true);
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
      
      // Update local state
      setQuestions([...questions, ...aiQuestions]);
      setShowAIGenerateModal(false);
    } catch (error) {
      console.error('Failed to save AI questions:', error);
      alert('Failed to save questions to the server');
    }
  };

  const handleEditQuestion = (question: Question, index: number) => {
    setEditingQuestion({ question, index });
    setShowManualQuestionModal(true);
  };

  const handleDeleteQuestion = (index: number) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const toggleQuestionExpanded = (questionId: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(questionId)) {
      newExpanded.delete(questionId);
    } else {
      newExpanded.add(questionId);
    }
    setExpandedQuestions(newExpanded);
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
        
        setQuestions([...questions, ...newQuestions]);
      }
      setShowManualQuestionModal(false);
    } catch (error) {
      console.error('Failed to save manual question:', error);
      alert('Failed to save question to the server');
    }
  };

  const handleStartGame = async () => {
    try {
      // Start the session first (changes state from LOBBY to ACTIVE)
      await axios.post(`${API_URL}/api/admin/session/${sessionId}/start`);
      
      // Then release the first question
      await axios.post(`${API_URL}/api/admin/session/${sessionId}/release-question`);
      
      setCurrentQuestionIndex(0);
      setSessionState('ACTIVE');
      
      // Reset answer distribution
      setAnswerCounts({ 0: 0, 1: 0, 2: 0, 3: 0 });
      setShowAnswerDistribution(false);
      setShowCorrectAnswer(false);
      setAnsweredCount(0);
      setAllAnswered(false);
      
      // Set timer to show distribution when question ends
      if (questions[0]) {
        const endTime = Date.now() + (questions[0].timeLimit * 1000);
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
    
    // Publish event to show distribution to all players
    if (connected && sessionId && currentQuestionIndex >= 0 && questions[currentQuestionIndex]) {
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
    
    // Publish event to reveal correct answer to all players
    if (connected && sessionId && currentQuestionIndex >= 0 && questions[currentQuestionIndex]) {
      console.log('Publishing reveal answer:', {
        questionIndex: currentQuestionIndex,
        correctIndex: questions[currentQuestionIndex].correctIndex
      });
      publish(`trivia/session/${sessionId}/admin/revealAnswer`, {
        questionIndex: currentQuestionIndex,
        correctIndex: questions[currentQuestionIndex].correctIndex
      });
    }
  };
  // Show answer distribution when timer expires
  useEffect(() => {
    if (questionTimerEnd) {
      const timeout = questionTimerEnd - Date.now();
      if (timeout > 0) {
        const timer = setTimeout(() => {
          setShowAnswerDistribution(true);
        }, timeout);
        return () => clearTimeout(timer);
      } else {
        setShowAnswerDistribution(true);
      }
    }
  }, [questionTimerEnd]);

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

  const joinUrl = `${CLIENT_URL}/?code=${sessionCode}`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Banner */}
      <div className="w-full bg-gradient-to-r from-millionaire-purple-dark via-millionaire-dark to-millionaire-purple-dark border-b border-millionaire-gold/30 px-6 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          {/* Left: Solace Logo + Dashboard button + Settings button */}
          <div className="flex items-center gap-2">
            <img src="/solace-logo.svg" alt="Solace" className="h-6 md:h-8 opacity-80 hover:opacity-100 transition-opacity" />
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-2 px-3 py-2 bg-millionaire-gold/20 hover:bg-millionaire-gold/30 text-millionaire-gold rounded-lg transition-colors"
              title="Back to Dashboard"
            >
              <span className="hidden md:inline font-semibold">Dashboard</span>
            </button>
            <button
              onClick={() => setShowAdminSettingsModal(true)}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 rounded-lg transition-colors"
              title="AI Settings"
            >
              <span>⚙️</span>
              <span className="hidden md:inline font-semibold">AI Settings</span>
            </button>
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
                  'bg-red-500 text-white'
                }`}>
                  {sessionState === 'LOBBY' ? '📋 Lobby' :
                   sessionState === 'ACTIVE' ? '🎮 Active Game' :
                   '🏁 Closed'}
                </span>
                {currentQuestionIndex >= 0 && (
                  <span className="text-millionaire-gold font-semibold drop-shadow-lg">
                    Question {currentQuestionIndex + 1} of {questions.length}
                  </span>
                )}
              </div>
            </div>
          </motion.div>

          {/* Solace Debug Toggle */}
          <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 flex gap-4"
        >
          <button
            onClick={() => window.open(`/presenter/${sessionId}`, '_blank', 'width=1920,height=1080')}
            className="btn-primary flex items-center space-x-2"
          >
            <span>🖥️</span>
            <span>Open Presenter View</span>
          </button>
          <button
            onClick={() => setShowDebugPanel(!showDebugPanel)}
            className="btn-primary flex items-center space-x-2"
          >
            <span>📡</span>
            <span>{showDebugPanel ? 'Hide' : 'Show'} Solace Messages</span>
          </button>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* QR Code & Players */}
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
                <QRCodeSVG value={joinUrl} size={showDebugPanel ? 150 : 200} />
              </div>
              <p className="mt-4 text-sm text-gray-400">
                Or visit: <br />
                <code className="text-millionaire-gold">{CLIENT_URL}</code>
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
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <AnimatePresence>
                  {players.map((player) => (
                    <motion.div
                      key={player.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center space-x-3 p-3 bg-purple-950/50 rounded-lg border border-purple-800/50"
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

          {/* Questions & Controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Question Controls */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="card"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                  Question Queue
                </h2>
                <button
                  onClick={() => setHideQuestions(!hideQuestions)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                    hideQuestions
                      ? 'bg-millionaire-gold text-millionaire-dark'
                      : 'bg-millionaire-purple-light text-white hover:bg-millionaire-purple'
                  }`}
                  title={hideQuestions ? 'Show questions' : 'Hide questions for screen sharing'}
                >
                  {hideQuestions ? '👁️ Show Questions' : '🙈 Hide Questions'}
                </button>
              </div>

              {sessionState === 'CLOSED' && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4 mb-6">
                  <div className="flex items-center space-x-2 text-red-700">
                    <span className="text-2xl">🏁</span>
                    <div>
                      <p className="font-bold text-lg">Game Closed</p>
                      <p className="text-sm">This session has ended. No more questions can be added.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex space-x-3 mb-6">
                <button 
                  onClick={handleAddManualQuestion} 
                  className="btn-secondary"
                  disabled={sessionState === 'CLOSED'}
                >
                  ➕ Add Manual
                </button>
                <button 
                  onClick={handleGenerateAI} 
                  className="btn-primary"
                  disabled={sessionState === 'CLOSED'}
                >
                  🤖 Generate with AI
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {hideQuestions ? (
                  <div className="text-center py-12 bg-purple-950/50 rounded-lg border border-purple-800/50">
                    <div className="text-6xl mb-4">🙈</div>
                    <p className="text-gray-300 text-lg font-semibold mb-2">Questions Hidden</p>
                    <p className="text-gray-400 text-sm">Click "Show Questions" to reveal ({questions.length} question{questions.length !== 1 ? 's' : ''} in queue)</p>
                  </div>
                ) : questions.length === 0 ? (
                  <div className="text-center py-12 bg-purple-950/50 rounded-lg border border-purple-800/50">
                    <div className="text-6xl mb-4">📝</div>
                    <p className="text-gray-300 text-lg font-semibold mb-2">No questions yet</p>
                    <p className="text-gray-400 text-sm">Add questions manually or generate with AI to get started</p>
                  </div>
                ) : (
                  questions.map((q, index) => {
                    const isExpanded = expandedQuestions.has(q.id);
                    const isNext = index === currentQuestionIndex + 1;
                    const canEdit = index > currentQuestionIndex && sessionState !== 'CLOSED';
                    
                    return (
                      <motion.div
                        key={q.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`rounded-lg border-2 ${
                          isNext
                            ? 'border-millionaire-gold bg-millionaire-gold/20'
                            : 'border-millionaire-gold/30 bg-millionaire-dark-light'
                        }`}
                      >
                        {/* Question Header - Always Visible */}
                        <div 
                          className="p-4 cursor-pointer hover:bg-purple-900/50 transition-colors rounded-t-lg"
                          onClick={() => toggleQuestionExpanded(q.id)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-lg text-white drop-shadow-lg">
                                  Q{index + 1}
                                </span>
                                <span className="font-semibold text-white drop-shadow-lg">
                                  {q.text}
                                </span>
                              </div>
                              <div className="text-sm text-gray-400 mt-1">
                                {q.timeLimit}s · {q.points} pts
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-2">
                              {isNext && (
                                <span className="bg-gradient-to-r from-millionaire-gold to-millionaire-orange text-white px-2 py-1 rounded text-xs font-semibold shadow-lg">
                                  NEXT
                                </span>
                              )}
                              <span className="text-gray-500">
                                {isExpanded ? '▲' : '▼'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Expanded Details */}
                        <AnimatePresence>
                          {isExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                              className="overflow-hidden border-t border-purple-700/50"
                            >
                              <div className="p-4 bg-purple-950/30">
                                {/* Answer Choices */}
                                <div className="space-y-2 mb-4">
                                  {q.choices.map((choice, i) => (
                                    <div
                                      key={i}
                                      className={`px-3 py-2 rounded-lg ${
                                        i === q.correctIndex
                                          ? 'bg-green-900/50 border-2 border-green-500 font-semibold text-green-300'
                                          : 'bg-millionaire-dark-light border border-millionaire-gold/30 text-white'
                                      }`}
                                    >
                                      <span className="font-bold">
                                        {String.fromCharCode(65 + i)}:
                                      </span>{' '}
                                      {choice}
                                      {i === q.correctIndex && (
                                        <span className="ml-2 text-green-400">✓ Correct</span>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {/* Action Buttons */}
                                {canEdit && (
                                  <div className="flex space-x-2">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditQuestion(q, index);
                                      }}
                                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-semibold"
                                    >
                                      ✏️ Edit Question
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteQuestion(index);
                                      }}
                                      className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-semibold"
                                    >
                                      🗑️ Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })
                )}
              </div>

              {questions.length > 0 && currentQuestionIndex === -1 && (
                <button
                  onClick={handleStartGame}
                  className="bg-solace-green hover:bg-solace-green-dark text-white font-bold py-4 px-6 rounded-lg w-full mt-4 text-xl"
                >
                  🎮 Start Game (Release First Question)
                </button>
              )}

              {questions.length > 0 && currentQuestionIndex >= 0 && !showAnswerDistribution && (
                <div className="mt-4 p-4 bg-gradient-to-br from-millionaire-purple-dark/80 to-millionaire-dark border-2 border-millionaire-gold/40 rounded-lg">
                  <div className="text-center mb-3">
                    <div className="text-3xl font-black text-white">
                      {answeredCount} / {players.length}
                    </div>
                    <div className="text-sm text-gray-300 font-semibold">
                      players have answered
                    </div>
                  </div>
                  {allAnswered && (
                    <div className="text-center text-green-400 font-bold mb-2">
                      ✅ All players answered!
                    </div>
                  )}
                  <button
                    onClick={handleShowResults}
                    disabled={answeredCount === 0 || sessionState === 'CLOSED'}
                    className="btn-primary w-full disabled:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    📊 Show Answer Distribution
                  </button>
                </div>
              )}

              {questions.length > 0 && currentQuestionIndex >= 0 && showAnswerDistribution && !showCorrectAnswer && (
                <button
                  onClick={handleRevealCorrectAnswer}
                  disabled={sessionState === 'CLOSED'}
                  className="bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-3 px-6 rounded-lg w-full mt-4 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  ✨ Reveal Correct Answer
                </button>
              )}

              {questions.length > 0 && currentQuestionIndex >= 0 && showCorrectAnswer && currentQuestionIndex < questions.length - 1 && (
                <button
                  onClick={handleReleaseQuestion}
                  disabled={sessionState === 'CLOSED'}
                  className="btn-primary w-full mt-4 text-lg"
                >
                  🚀 Release Next Question
                </button>
              )}

              {questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length - 1 && !showAnswerDistribution && (
                <button
                  onClick={handleReleaseQuestion}
                  disabled={sessionState === 'CLOSED'}
                  className="btn-secondary w-full mt-2 text-sm"
                >
                  ⏭️ Skip to Next Question
                </button>
              )}

              {questions.length > 0 && currentQuestionIndex >= questions.length - 1 && sessionState !== 'CLOSED' && (
                <button
                  onClick={handleCloseSession}
                  className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-lg w-full mt-4"
                >
                  🏁 Close Session & Show Leaderboard
                </button>
              )}

              {questions.length > 0 && currentQuestionIndex >= 0 && currentQuestionIndex < questions.length - 1 && sessionState !== 'CLOSED' && (
                <button
                  onClick={handleCloseSession}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-lg w-full mt-4"
                >
                  ⚠️ End Game Early
                </button>
              )}
            </motion.div>

            {/* Answer Distribution Chart */}
            <AnimatePresence>
              {showAnswerDistribution && currentQuestionIndex >= 0 && questions[currentQuestionIndex] && (
                <AnswerDistributionChart
                  questionText={questions[currentQuestionIndex].text}
                  choices={questions[currentQuestionIndex].choices}
                  correctIndex={questions[currentQuestionIndex].correctIndex}
                  stats={[0, 1, 2, 3].map(index => ({
                    choiceIndex: index,
                    count: answerCounts[index] || 0,
                    percentage: players.length > 0 
                      ? ((answerCounts[index] || 0) / players.length) * 100 
                      : 0
                  }))}
                  totalResponses={Object.values(answerCounts).reduce((a, b) => a + b, 0)}
                  showCorrectAnswer={showCorrectAnswer}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

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

      {/* Solace Debug Panel - Side Panel */}
      <AnimatePresence>
        {showDebugPanel && (
          <SolaceDebugPanel 
            sessionId={sessionId!} 
            onClose={() => setShowDebugPanel(false)}
          />
        )}
      </AnimatePresence>

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
    </div>
  );
}
