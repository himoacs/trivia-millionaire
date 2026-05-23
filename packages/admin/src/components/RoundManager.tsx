import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import type { Round, Question } from '@trivia-millionaire/shared';
import ImportExportModal from './ImportExportModal';
import TemplateManagerModal from './TemplateManagerModal';
import ManualQuestionModal from './ManualQuestionModal';
import AIGenerateModal from './AIGenerateModal';
import AnswerDistributionChart from './AnswerDistributionChart';

const API_URL = import.meta.env.VITE_API_URL || '';

interface GameControlState {
  currentQuestionIndex: number;
  answeredCount: number;
  totalPlayers: number;
  allAnswered: boolean;
  showAnswerDistribution: boolean;
  showCorrectAnswer: boolean;
  answerCounts: Record<number, number>;
  questionTimerEnd: number | null;
}

interface GameControlHandlers {
  onStartGame: () => void;
  onShowResults: () => void;
  onRevealAnswer: () => void;
  onNextQuestion: () => void;
  onSkipQuestion: () => void;
  onCloseSession: () => void;
  onJumpToQuestion?: (questionIndex: number) => void;
  onSkipToRound?: (roundIndex: number) => void;
}

interface RoundManagerProps {
  sessionId: string;
  questions: Question[];
  sessionState: 'LOBBY' | 'ACTIVE' | 'PAUSED' | 'CLOSED';
  currentRoundIndex: number;
  onRoundStarted: (round: Round) => void;
  onRoundEnded: (round: Round, leaderboard: any[]) => void;
  onRoundsChanged: (rounds: Round[]) => void;
  onQuestionsChanged?: () => void;
  // Game control props
  gameState?: GameControlState;
  gameHandlers?: GameControlHandlers;
}

export default function RoundManager({
  sessionId,
  questions,
  sessionState,
  currentRoundIndex,
  onRoundStarted,
  onRoundEnded,
  onRoundsChanged,
  onQuestionsChanged,
  gameState,
  gameHandlers
}: RoundManagerProps) {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());
  const [newRoundName, setNewRoundName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState<Round | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [showImportExportModal, setShowImportExportModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState<string | null>(null); // roundId
  const [showAIModal, setShowAIModal] = useState<string | null>(null); // roundId
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());
  const [timerExpired, setTimerExpired] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);

  // Timer countdown effect
  useEffect(() => {
    if (!gameState?.questionTimerEnd) {
      setTimerExpired(false);
      setTimeRemaining(null);
      return;
    }

    const updateTimer = () => {
      const remaining = gameState.questionTimerEnd! - Date.now();
      if (remaining <= 0) {
        setTimerExpired(true);
        setTimeRemaining(0);
      } else {
        setTimerExpired(false);
        setTimeRemaining(Math.ceil(remaining / 1000));
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [gameState?.questionTimerEnd]);

  const toggleQuestionExpansion = (questionId: string) => {
    setExpandedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
  };

  // Load rounds from server
  useEffect(() => {
    loadRounds();
  }, [sessionId]);

  const loadRounds = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/admin/session/${sessionId}/rounds`);
      if (response.data.success) {
        setRounds(response.data.data.rounds || []);
        onRoundsChanged(response.data.data.rounds || []);
      }
    } catch (error) {
      console.error('Failed to load rounds:', error);
    }
  };

  const handleCreateRound = async () => {
    if (!newRoundName.trim()) return;
    setIsCreating(true);

    try {
      const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/rounds`, {
        name: newRoundName.trim()
      });

      if (response.data.success) {
        setRounds(prev => [...prev, response.data.data.round]);
        onRoundsChanged([...rounds, response.data.data.round]);
        setNewRoundName('');
      }
    } catch (error) {
      console.error('Failed to create round:', error);
      alert('Failed to create round');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeleteRound = async (roundId: string) => {
    const confirmed = window.confirm('Delete this round? Questions will be unassigned but not deleted.');
    if (!confirmed) return;

    try {
      await axios.delete(`${API_URL}/api/admin/session/${sessionId}/rounds/${roundId}`);
      setRounds(prev => prev.filter(r => r.id !== roundId));
      onRoundsChanged(rounds.filter(r => r.id !== roundId));
    } catch (error) {
      console.error('Failed to delete round:', error);
      alert('Failed to delete round');
    }
  };

  const handleStartRound = async (roundId: string) => {
    try {
      const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/rounds/${roundId}/start`);
      if (response.data.success) {
        const updatedRound = response.data.data.round;
        setRounds(prev => prev.map(r => r.id === roundId ? updatedRound : r));
        onRoundStarted(updatedRound);
        loadRounds(); // Refresh to get updated states
      }
    } catch (error) {
      console.error('Failed to start round:', error);
      alert('Failed to start round');
    }
  };

  const handleEndCurrentRound = async () => {
    try {
      const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/rounds/end-current`);
      if (response.data.success) {
        onRoundEnded(response.data.data.round, response.data.data.leaderboard);
        loadRounds(); // Refresh to get updated states
      }
    } catch (error) {
      console.error('Failed to end round:', error);
      alert('Failed to end round');
    }
  };

  const handleStartNextRound = async () => {
    try {
      const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/rounds/start-next`);
      if (response.data.success) {
        onRoundStarted(response.data.data.round);
        loadRounds(); // Refresh to get updated states
      }
    } catch (error) {
      console.error('Failed to start next round:', error);
      alert('No more rounds available');
    }
  };

  const openAssignModal = (round: Round) => {
    setSelectedQuestionIds([...round.questionIds]);
    setShowAssignModal(round);
  };

  const toggleRoundExpansion = (roundId: string) => {
    setExpandedRounds(prev => {
      const next = new Set(prev);
      if (next.has(roundId)) {
        next.delete(roundId);
      } else {
        next.add(roundId);
      }
      return next;
    });
  };

  const handleSaveAssignment = async () => {
    if (!showAssignModal) return;

    try {
      // First, find questions that need to be removed from other rounds
      const questionsToReassign = selectedQuestionIds.filter(qId => {
        // Check if this question is in another round
        return rounds.some(r => r.id !== showAssignModal.id && r.questionIds.includes(qId));
      });

      // Remove reassigned questions from their current rounds
      const updatedRounds = rounds.map(r => {
        if (r.id === showAssignModal.id) {
          // This is the target round - will be updated separately
          return r;
        }
        // Remove any reassigned questions from other rounds
        const newQuestionIds = r.questionIds.filter(qId => !questionsToReassign.includes(qId));
        if (newQuestionIds.length !== r.questionIds.length) {
          // Update this round on the server
          axios.put(
            `${API_URL}/api/admin/session/${sessionId}/rounds/${r.id}`,
            { questionIds: newQuestionIds }
          ).catch(err => console.error('Failed to update round:', err));
        }
        return { ...r, questionIds: newQuestionIds };
      });

      // Now update the target round
      const response = await axios.put(
        `${API_URL}/api/admin/session/${sessionId}/rounds/${showAssignModal.id}`,
        { questionIds: selectedQuestionIds }
      );

      if (response.data.success) {
        // Update local state immediately for instant feedback
        const finalRounds = updatedRounds.map(r => 
          r.id === showAssignModal.id 
            ? { ...r, questionIds: selectedQuestionIds }
            : r
        );
        setRounds(finalRounds);
        onRoundsChanged(finalRounds);
        
        // Close modal
        setShowAssignModal(null);
        
        // Refresh from server in background to ensure data consistency
        loadRounds().then(() => {
          if (onQuestionsChanged) {
            onQuestionsChanged();
          }
        });
      }
    } catch (error) {
      console.error('Failed to update round:', error);
      alert('Failed to update round');
    }
  };

  const toggleQuestionSelection = (questionId: string) => {
    setSelectedQuestionIds(prev => 
      prev.includes(questionId)
        ? prev.filter(id => id !== questionId)
        : [...prev, questionId]
    );
  };

  // Import/Export handlers
  const handleExport = async (): Promise<{ yaml: string; filename: string }> => {
    const response = await axios.get(`${API_URL}/api/admin/session/${sessionId}/export`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Export failed');
    }
    return response.data.data;
  };

  const handleImport = async (yamlContent: string, replaceExisting: boolean): Promise<void> => {
    const response = await axios.post(`${API_URL}/api/admin/session/${sessionId}/import`, {
      yamlContent,
      replaceExisting
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Import failed');
    }
    await loadRounds();
  };

  // Template handlers
  const fetchTemplates = async () => {
    const response = await axios.get(`${API_URL}/api/admin/templates`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to fetch templates');
    }
    return response.data.data.templates;
  };

  const handleLoadTemplate = async (templateId: string, replaceExisting: boolean): Promise<void> => {
    const response = await axios.post(
      `${API_URL}/api/admin/session/${sessionId}/load-template/${templateId}`,
      { replaceExisting }
    );
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to load template');
    }
    await loadRounds();
    // Notify parent to refresh questions
    if (onQuestionsChanged) {
      onQuestionsChanged();
    }
  };

  const handleSaveAsTemplate = async (name: string, description: string): Promise<void> => {
    const response = await axios.post(`${API_URL}/api/admin/templates`, {
      name,
      description,
      sessionId
    });
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to save template');
    }
  };

  const handleDeleteTemplate = async (templateId: string): Promise<void> => {
    const response = await axios.delete(`${API_URL}/api/admin/templates/${templateId}`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to delete template');
    }
  };

  const handleConvertTemplate = async (templateId: string): Promise<void> => {
    const response = await axios.put(`${API_URL}/api/admin/templates/${templateId}/convert-to-unassigned`);
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to convert template');
    }
  };

  // Handle AI question generation for a specific round
  const handleAIGenerate = async (topic: string, count: number, docs?: string): Promise<Question[]> => {
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
    if (!response.data.success) {
      throw new Error(response.data.error || 'Failed to generate questions');
    }
    return response.data.data.questions;
  };

  // Save AI-generated questions to a specific round
  const handleSaveAIQuestions = async (aiQuestions: Question[], roundId: string) => {
    try {
      // Add roundId to each question
      const questionsWithRound = aiQuestions.map(q => ({ ...q, roundId }));
      
      await axios.post(
        `${API_URL}/api/admin/session/${sessionId}/questions`,
        { questions: questionsWithRound, roundId }
      );
      
      await loadRounds();
      onQuestionsChanged?.();
      setShowAIModal(null);
    } catch (error) {
      console.error('Failed to save AI questions:', error);
      alert('Failed to save questions');
    }
  };

  // Save manually created questions to a specific round
  const handleSaveManualQuestions = async (newQuestions: Question[], roundId: string) => {
    try {
      // Add roundId to each question
      const questionsWithRound = newQuestions.map(q => ({ ...q, roundId }));
      
      await axios.post(
        `${API_URL}/api/admin/session/${sessionId}/questions`,
        { questions: questionsWithRound, roundId }
      );
      
      await loadRounds();
      onQuestionsChanged?.();
      setShowManualModal(null);
    } catch (error) {
      console.error('Failed to save manual questions:', error);
      alert('Failed to save questions');
    }
  };

  // Get unassigned questions
  const assignedQuestionIds = new Set(rounds.flatMap(r => r.questionIds));
  const unassignedQuestions = questions.filter(q => !assignedQuestionIds.has(q.id));

  const currentRound = currentRoundIndex >= 0 ? rounds[currentRoundIndex] : null;
  const hasNextRound = currentRoundIndex < rounds.length - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card mb-6"
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between"
      >
        <div 
          className="flex items-center gap-2 cursor-pointer flex-1"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            🎯 Rounds Management
            <span className="text-sm font-normal text-gray-400">
              ({rounds.length} round{rounds.length !== 1 ? 's' : ''})
            </span>
          </h2>
          <span className="text-gray-400">{isExpanded ? '▲' : '▼'}</span>
        </div>
        
        {/* Import/Export/Template Buttons */}
        {sessionState === 'LOBBY' && (
          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setShowImportExportModal(true)}
              className="btn-warning btn-sm"
              title="Import or export rounds and questions as YAML"
              aria-label="Import/Export YAML"
            >
              📥 Import/Export
            </button>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="btn-secondary btn-sm"
              title="Load or save question templates"
              aria-label="Manage Templates"
            >
              📁 Templates
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-4 space-y-4">
              {/* Status Banner */}
              {sessionState === 'PAUSED' && currentRound && (
                <div className="bg-yellow-500/20 border-2 border-yellow-500 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">☕</span>
                      <div>
                        <p className="font-bold text-yellow-300">Break Time!</p>
                        <p className="text-sm text-yellow-200">
                          {currentRound.name} completed. {hasNextRound ? 'Click below to start the next round.' : 'This was the final round.'}
                        </p>
                      </div>
                    </div>
                    {hasNextRound ? (
                      <button
                        onClick={handleStartNextRound}
                        className="btn-primary"
                        title="Start the next round"
                      >
                        ▶️ Start Next Round
                      </button>
                    ) : gameHandlers?.onCloseSession && (
                      <button
                        onClick={gameHandlers.onCloseSession}
                        className="btn-danger-solid"
                        title="End the game and show final leaderboard"
                      >
                        🏁 Close Session & Show Leaderboard
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Active Round Controls */}
              {sessionState === 'ACTIVE' && currentRound && (
                <div className="bg-green-500/20 border-2 border-green-500 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">🎮</span>
                      <div>
                        <p className="font-bold text-green-300">Round In Progress</p>
                        <p className="text-sm text-green-200">
                          {currentRound.name} (Round {currentRoundIndex + 1} of {rounds.length})
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleEndCurrentRound}
                      className="btn-warning"
                      title="End the current round and take a break"
                    >
                      ⏸️ End Round (Break)
                    </button>
                  </div>
                </div>
              )}

              {/* Create New Round - Only in LOBBY */}
              {sessionState === 'LOBBY' && (
                <div className="flex items-center gap-3 p-4 bg-millionaire-navy-dark/50 rounded-lg border border-millionaire-blue-dark/50">
                  <input
                    type="text"
                    placeholder="Enter round name (e.g., 'Module 1: Introduction')"
                    value={newRoundName}
                    onChange={(e) => setNewRoundName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateRound()}
                    className="flex-1 px-4 py-2.5 bg-millionaire-dark border border-millionaire-gold/30 rounded-lg text-white placeholder-gray-500 focus:border-millionaire-gold focus:outline-none"
                  />
                  <button
                    onClick={handleCreateRound}
                    disabled={!newRoundName.trim() || isCreating}
                    className="btn-primary px-6 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ➕ Create Round
                  </button>
                </div>
              )}

              {/* Rounds List with Unified View */}
              {rounds.length > 0 && (
                <div className="space-y-3">
                  {rounds.map((round, index) => {
                    const isActive = index === currentRoundIndex && sessionState === 'ACTIVE';
                    const isCompleted = round.state === 'COMPLETED';
                    const isPending = round.state === 'PENDING';
                    const canEdit = sessionState === 'LOBBY';
                    const canStart = sessionState === 'LOBBY' && index === 0 && round.questionIds.length > 0;
                    const isRoundExpanded = expandedRounds.has(round.id);
                    const roundQuestions = round.questions || [];

                    return (
                      <div
                        key={round.id}
                        className={`rounded-lg border-2 overflow-hidden ${
                          isActive
                            ? 'border-green-500 bg-green-500/20'
                            : isCompleted
                            ? 'border-gray-500 bg-gray-500/20'
                            : isPending
                            ? 'border-millionaire-gold/50 bg-millionaire-gold/10'
                            : 'border-millionaire-gold/30 bg-millionaire-dark-light'
                        }`}
                      >
                        {/* Round Header */}
                        <div 
                          className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => toggleRoundExpansion(round.id)}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400 text-lg">
                              {isRoundExpanded ? '▼' : '▶'}
                            </span>
                            <span className={`font-bold text-lg ${
                              isActive ? 'text-green-400' :
                              isCompleted ? 'text-gray-400' :
                              'text-white'
                            }`}>
                              Round {index + 1}
                            </span>
                            <span className={`${
                              isActive ? 'text-green-300' :
                              isCompleted ? 'text-gray-400' :
                              'text-white'
                            }`}>
                              {round.name}
                            </span>
                            <span className="px-2 py-1 bg-millionaire-dark rounded text-xs text-gray-400">
                              {round.questionIds.length} questions
                            </span>
                            {isActive && (() => {
                              // Calculate current question for progress indicator
                              const globalCurrentQ = gameState?.currentQuestionIndex ?? -1;
                              const currentQuestionId = globalCurrentQ >= 0 ? questions[globalCurrentQ]?.id : null;
                              const currentQIndexInRound = currentQuestionId ? round.questionIds.indexOf(currentQuestionId) : -1;
                              const progressText = currentQIndexInRound >= 0 
                                ? `Q${currentQIndexInRound + 1}/${round.questionIds.length}` 
                                : 'Starting...';
                              
                              return (
                                <span className="px-2 py-1 bg-green-600 rounded text-xs text-white font-semibold">
                                  ▶ {progressText}
                                </span>
                              );
                            })()}
                            {isCompleted && (
                              <span className="px-2 py-1 bg-gray-600 rounded text-xs text-white">
                                COMPLETED
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <>
                                <button
                                  onClick={() => openAssignModal(round)}
                                  className="btn-secondary btn-sm"
                                  title="Assign existing questions to this round"
                                >
                                  📝 Assign Questions
                                </button>
                                <button
                                  onClick={() => handleDeleteRound(round.id)}
                                  className="btn-icon-danger btn-icon-sm"
                                  title="Delete this round"
                                  aria-label="Delete round"
                                >
                                  🗑️
                                </button>
                              </>
                            )}
                            {canStart && (
                              <button
                                onClick={() => handleStartRound(round.id)}
                                className="btn-primary"
                                title="Start the game with this round"
                              >
                                ▶️ Start Game
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Game Controls - Show when round is active (Always visible) */}
                        {isActive && gameState && gameHandlers && (() => {
                          // Calculate round-relative question index from global index
                          const globalCurrentQ = gameState.currentQuestionIndex;
                          const currentQuestionId = globalCurrentQ >= 0 ? questions[globalCurrentQ]?.id : null;
                          const currentQIndexInRound = currentQuestionId ? round.questionIds.indexOf(currentQuestionId) : -1;
                          
                          return (
                          <div className="p-4 bg-gradient-to-r from-green-900/30 to-green-800/30 border-t border-green-500/30">
                            {/* Answer Progress */}
                            <div className="text-center mb-4">
                              <div className="text-3xl font-black text-white">
                                {gameState.answeredCount} / {gameState.totalPlayers}
                              </div>
                              <div className="text-sm text-gray-300 font-semibold">
                                players have answered
                              </div>
                              {gameState.allAnswered && (
                                <div className="text-green-400 font-bold mt-1">
                                  ✅ All players answered!
                                </div>
                              )}
                            </div>
                            
                            {/* Control Buttons */}
                            <div className="flex flex-wrap gap-2 justify-center">
                              {/* Start Game - Release First Question */}
                              {currentQIndexInRound === -1 && (
                                <button
                                  onClick={gameHandlers.onStartGame}
                                  className="btn-success btn-lg"
                                  title="Release the first question to players"
                                >
                                  🎮 Start Game (Release First Question)
                                </button>
                              )}
                              
                              {currentQIndexInRound >= 0 && !gameState.showAnswerDistribution && (() => {
                                const canShowDistribution = timerExpired || gameState.allAnswered;
                                return (
                                  <button
                                    onClick={gameHandlers.onShowResults}
                                    disabled={!canShowDistribution}
                                    className="btn-secondary"
                                    title={canShowDistribution ? 'Show answer distribution to players' : 'Wait for timer or all answers'}
                                  >
                                    {canShowDistribution 
                                      ? '📊 Show Distribution' 
                                      : `⏳ ${timeRemaining}s remaining (${gameState.answeredCount}/${gameState.totalPlayers} answered)`}
                                  </button>
                                );
                              })()}
                              
                              {gameState.showAnswerDistribution && !gameState.showCorrectAnswer && (
                                <button
                                  onClick={gameHandlers.onRevealAnswer}
                                  className="btn-warning"
                                  title="Reveal the correct answer to all players"
                                >
                                  ✨ Reveal Answer
                                </button>
                              )}
                              
                              {gameState.showCorrectAnswer && currentQIndexInRound < roundQuestions.length - 1 && (
                                <button
                                  onClick={gameHandlers.onNextQuestion}
                                  className="btn-success"
                                  title="Move to the next question"
                                >
                                  🚀 Next Question
                                </button>
                              )}
                              
                              {currentQIndexInRound >= 0 && !gameState.showAnswerDistribution && currentQIndexInRound < roundQuestions.length - 1 && (
                                <button
                                  onClick={gameHandlers.onSkipQuestion}
                                  className="btn-ghost btn-sm"
                                  title="Skip this question and move to next"
                                >
                                  ⏭️ Skip
                                </button>
                              )}
                              
                              {currentQIndexInRound >= roundQuestions.length - 1 && gameState.showCorrectAnswer && (
                                <button
                                  onClick={gameHandlers.onCloseSession}
                                  className="btn-danger-solid"
                                  title="End the game and show final leaderboard"
                                >
                                  🏁 End Game
                                </button>
                              )}
                            </div>
                            
                            {/* Advanced Controls - Round Skip */}
                            <div className="mt-4 pt-4 border-t border-green-500/20">
                              <div className="flex flex-wrap gap-4 justify-center items-center">
                                {/* Skip to Different Round */}
                                {gameHandlers.onSkipToRound && rounds.length > 1 && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">Skip to round:</span>
                                    <select
                                      onChange={(e) => {
                                        const idx = parseInt(e.target.value);
                                        if (idx >= 0) {
                                          gameHandlers.onSkipToRound!(idx);
                                        }
                                      }}
                                      className="bg-millionaire-navy border border-millionaire-gold/30 rounded px-2 py-1 text-sm text-white"
                                      defaultValue=""
                                    >
                                      <option value="" disabled>Select round...</option>
                                      {rounds.map((r, rIdx) => (
                                        <option 
                                          key={r.id} 
                                          value={rIdx}
                                          disabled={rIdx === currentRoundIndex}
                                        >
                                          {rIdx + 1}. {r.name} {rIdx === currentRoundIndex ? '(current)' : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                
                                {/* End Current Round Early */}
                                <button
                                  onClick={handleEndCurrentRound}
                                  className="btn-warning btn-sm"
                                  title="End this round early and take a break"
                                >
                                  ⏸️ End Round Early
                                </button>
                              </div>
                            </div>
                          </div>
                          );
                        })()}

                        {/* Questions List (Expandable) */}
                        <AnimatePresence>
                          {isRoundExpanded && (
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-white/10 bg-millionaire-navy/70">
                                {/* Add Questions Buttons */}
                                {canEdit && (
                                  <div className="px-4 py-3 flex items-center gap-3 border-b border-white/10 bg-millionaire-navy-dark/50">
                                    <span className="text-gray-400 text-sm">Add questions:</span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setShowManualModal(round.id); }}
                                      className="btn-secondary btn-sm"
                                      title="Manually create a new question"
                                    >
                                      ➕ Add Manual
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setShowAIModal(round.id); }}
                                      className="btn-ai btn-sm"
                                      title="Generate questions using AI"
                                    >
                                      🤖 Generate with AI
                                    </button>
                                  </div>
                                )}
                                
                                {/* Questions List */}
                                {roundQuestions.length > 0 ? (
                                  roundQuestions.map((q: Question, qIndex: number) => {
                                    const isQuestionExpanded = expandedQuestions.has(q.id);
                                    // Determine if this is the current question being played
                                    // Note: gameState.currentQuestionIndex is a GLOBAL index across all questions
                                    // We need to find if the current global question is in THIS round
                                    const globalCurrentQ = gameState?.currentQuestionIndex ?? -1;
                                    const currentQuestionId = globalCurrentQ >= 0 ? questions[globalCurrentQ]?.id : null;
                                    const currentQIndexInRound = currentQuestionId ? round.questionIds.indexOf(currentQuestionId) : -1;
                                    const isCurrentQuestion = isActive && currentQIndexInRound >= 0 && currentQIndexInRound === qIndex;
                                    const isAnswered = isActive && currentQIndexInRound >= 0 && qIndex < currentQIndexInRound;
                                    
                                    return (
                                      <div
                                        key={q.id}
                                        className={`border-b border-white/5 last:border-b-0 ${
                                          isCurrentQuestion ? 'bg-green-500/20 border-l-4 border-l-green-500' :
                                          isAnswered ? 'bg-gray-500/10 opacity-60' : ''
                                        }`}
                                      >
                                        {/* Question Header - Clickable */}
                                        <div 
                                          className={`px-4 py-3 cursor-pointer flex items-center gap-3 ${
                                            isCurrentQuestion ? 'hover:bg-green-500/30' : 'hover:bg-white/5'
                                          }`}
                                          onClick={() => toggleQuestionExpansion(q.id)}
                                        >
                                          <span className="text-gray-400 text-sm">
                                            {isQuestionExpanded ? '▼' : '▶'}
                                          </span>
                                          <span className={`font-semibold min-w-[32px] ${
                                            isCurrentQuestion ? 'text-green-400' : 'text-millionaire-gold'
                                          }`}>
                                            Q{qIndex + 1}
                                          </span>
                                          {isCurrentQuestion && (
                                            <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded font-bold animate-pulse">
                                              NOW PLAYING
                                            </span>
                                          )}
                                          {isAnswered && (
                                            <span className="px-2 py-0.5 bg-gray-500 text-white text-xs rounded">
                                              ✓ Done
                                            </span> whitespace-nowrap"
                                              title={`Skip to question ${qIndex + 1}`}
                                            >
                                              ⏭️estion Button */}
                                          {isActive && gameHandlers?.onJumpToQuestion && !isCurrentQuestion && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                gameHandlers.onJumpToQuestion!(qIndex);
                                              }}
                                              className="btn-ghost btn-sm text-xs px-2 py-1"
                                              title={`Skip to this question`}
                                            >
                                              ⏭️ Skip to Q{qIndex + 1}
                                            </button>
                                          )}
                                          <div className="flex items-center gap-2 text-xs text-gray-500">
                                            {q.difficulty && (
                                              <span className={`px-2 py-0.5 rounded ${
                                                q.difficulty === 'easy' ? 'bg-green-900/50 text-green-400' :
                                                q.difficulty === 'medium' ? 'bg-yellow-900/50 text-yellow-400' :
                                                'bg-red-900/50 text-red-400'
                                              }`}>
                                                {q.difficulty}
                                              </span>
                                            )}
                                            <span>{q.timeLimit}s</span>
                                          </div>
                                        </div>
                                        
                                        {/* Question Details - Expandable */}
                                        <AnimatePresence>
                                          {isQuestionExpanded && (
                                            <motion.div
                                              initial={{ height: 0, opacity: 0 }}
                                              animate={{ height: 'auto', opacity: 1 }}
                                              exit={{ height: 0, opacity: 0 }}
                                              transition={{ duration: 0.2 }}
                                              className="overflow-hidden"
                                            >
                                              <div className="px-4 pb-3 pl-16">
                                                {/* Show answer distribution for current question if enabled */}
                                                {isCurrentQuestion && gameState?.showAnswerDistribution && (
                                                  <div className="mb-4">
                                                    <AnswerDistributionChart
                                                      questionText={q.text}
                                                      choices={q.choices}
                                                      correctIndex={gameState.showCorrectAnswer ? q.correctIndex : -1}
                                                      stats={[0, 1, 2, 3].map(idx => ({
                                                        choiceIndex: idx,
                                                        count: gameState.answerCounts[idx] || 0,
                                                        percentage: gameState.answeredCount > 0 
                                                          ? ((gameState.answerCounts[idx] || 0) / gameState.answeredCount) * 100 
                                                          : 0
                                                      }))}
                                                      totalResponses={gameState.answeredCount}
                                                      showCorrectAnswer={gameState.showCorrectAnswer}
                                                    />
                                                  </div>
                                                )}
                                                <div className="grid grid-cols-2 gap-2">
                                                  {q.choices.map((choice: string, cIndex: number) => (
                                                    <div
                                                      key={cIndex}
                                                      className={`px-2 py-1 rounded text-xs ${
                                                        cIndex === q.correctIndex && (gameState?.showCorrectAnswer || !isCurrentQuestion)
                                                          ? 'bg-green-600/30 text-green-300 border border-green-500/50'
                                                          : 'bg-millionaire-navy-dark/50 text-gray-400'
                                                      }`}
                                                    >
                                                      <span className="font-semibold mr-1">
                                                        {String.fromCharCode(65 + cIndex)}:
                                                      </span>
                                                      {choice}
                                                    </div>
                                                  ))}
                                                </div>
                                                <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                                                  {q.category && (
                                                    <span className="px-2 py-0.5 bg-millionaire-dark rounded">
                                                      {q.category}
                                                    </span>
                                                  )}
                                                  <span>{q.points} pts</span>
                                                </div>
                                              </div>
                                            </motion.div>
                                          )}
                                        </AnimatePresence>
                                      </div>
                                    );
                                  })
                                ) : (
                                  <div className="px-4 py-6 text-center text-gray-400 text-sm">
                                    No questions in this round yet. Add questions above.
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Unassigned Questions Warning */}
              {sessionState === 'LOBBY' && rounds.length > 0 && unassignedQuestions.length > 0 && (
                <div className="p-3 bg-orange-500/20 border border-orange-500 rounded-lg">
                  <p className="text-orange-300 text-sm">
                    ⚠️ {unassignedQuestions.length} question(s) are not assigned to any round.
                    They will not be played unless assigned.
                  </p>
                </div>
              )}

              {/* No Rounds Yet - Better Empty State */}
              {rounds.length === 0 && sessionState === 'LOBBY' && (
                <div className="text-center py-12 bg-gradient-to-br from-millionaire-navy-dark/80 to-millionaire-dark border-2 border-dashed border-millionaire-gold/30 rounded-xl">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-xl font-bold text-white mb-2">Create Your First Round</h3>
                  <p className="text-gray-400 mb-6 max-w-md mx-auto">
                    Organize your trivia into rounds. Each round can have its own set of questions.
                    Enter a name above and click "Create Round" to get started.
                  </p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="w-8 h-8 rounded-full bg-millionaire-gold/20 flex items-center justify-center text-millionaire-gold font-bold">1</span>
                      <span>Create a round</span>
                    </div>
                    <span className="text-gray-600 hidden sm:inline">→</span>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="w-8 h-8 rounded-full bg-millionaire-gold/20 flex items-center justify-center text-millionaire-gold font-bold">2</span>
                      <span>Add questions inside</span>
                    </div>
                    <span className="text-gray-600 hidden sm:inline">→</span>
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="w-8 h-8 rounded-full bg-millionaire-gold/20 flex items-center justify-center text-millionaire-gold font-bold">3</span>
                      <span>Start the game!</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Question Assignment Modal */}
      <AnimatePresence>
        {showAssignModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setShowAssignModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-millionaire-dark border-2 border-millionaire-gold rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-4">
                Assign Questions to "{showAssignModal.name}"
              </h3>
              
              <p className="text-sm text-gray-400 mb-4">
                Click questions to select/deselect. Questions from other rounds will be moved here.
              </p>
              
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {questions.map((q, index) => {
                  const isSelected = selectedQuestionIds.includes(q.id);
                  const isAssignedElsewhere = !isSelected && assignedQuestionIds.has(q.id);
                  const currentRound = isAssignedElsewhere ? rounds.find(r => r.questionIds.includes(q.id)) : null;
                  
                  return (
                    <div
                      key={q.id}
                      onClick={() => toggleQuestionSelection(q.id)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-green-600/30 border-2 border-green-500'
                          : isAssignedElsewhere
                          ? 'bg-yellow-600/20 border border-yellow-500/50 hover:border-yellow-500'
                          : 'bg-millionaire-navy-dark border border-millionaire-gold/30 hover:border-millionaire-gold'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="w-5 h-5"
                        />
                        <span className="font-semibold text-white">Q{index + 1}:</span>
                        <span className="text-gray-300 flex-1 truncate">{q.text}</span>
                        {isAssignedElsewhere && currentRound && (
                          <span className="text-xs text-yellow-400">(in {currentRound.name})</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-between border-t border-millionaire-gold/30 pt-4">
                <span className="text-gray-400">
                  {selectedQuestionIds.length} question(s) selected
                </span>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowAssignModal(null)}
                    className="px-4 py-2 bg-millionaire-navy-light hover:bg-millionaire-navy text-white rounded transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveAssignment}
                    className="btn-primary"
                  >
                    Save Assignment
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import/Export Modal */}
      <AnimatePresence>
        {showImportExportModal && (
          <ImportExportModal
            sessionId={sessionId}
            sessionName={`Session ${sessionId.slice(0, 8)}`}
            onClose={() => setShowImportExportModal(false)}
            onImport={handleImport}
            onExport={handleExport}
          />
        )}
      </AnimatePresence>

      {/* Template Manager Modal */}
      <AnimatePresence>
        {showTemplateModal && (
          <TemplateManagerModal
            sessionId={sessionId}
            onClose={() => setShowTemplateModal(false)}
            onLoadTemplate={handleLoadTemplate}
            onSaveAsTemplate={handleSaveAsTemplate}
            onDeleteTemplate={handleDeleteTemplate}
            onConvertTemplate={handleConvertTemplate}
            fetchTemplates={fetchTemplates}
          />
        )}
      </AnimatePresence>

      {/* Manual Question Modal */}
      <AnimatePresence>
        {showManualModal && (
          <ManualQuestionModal
            onClose={() => setShowManualModal(null)}
            onSave={(questions) => handleSaveManualQuestions(questions, showManualModal)}
            editQuestion={undefined}
          />
        )}
      </AnimatePresence>

      {/* AI Generate Modal */}
      <AnimatePresence>
        {showAIModal && (
          <AIGenerateModal
            onClose={() => setShowAIModal(null)}
            onGenerate={handleAIGenerate}
            onSave={(questions) => handleSaveAIQuestions(questions, showAIModal)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
