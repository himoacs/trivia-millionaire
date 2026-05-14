import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SolaceService } from './services/solace.js';
import { SessionManager } from './services/session.js';
import { AIQuestionGenerator } from './services/ai.js';
import { getDatabase } from './services/database.js';
import yaml from 'js-yaml';
import type {
  Answer,
  AdminCommand,
  PlayerEvent,
  QuestionMessage,
  PlayerAvatar,
  ApiResponse,
  CreateSessionResponse,
  JoinSessionResponse,
  AIQuestionRequest,
  AdminSettings,
  Round,
  RoundStartedMessage,
  RoundEndedMessage,
  ReconnectResponse
} from '@trivia-millionaire/shared';

// Load environment variables from root .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || '*'
}));
app.use(express.json());

// Initialize services
const solaceConfig = {
  url: process.env.SOLACE_BROKER_URL || 'ws://localhost:8008',
  vpnName: process.env.SOLACE_VPN_NAME || 'default',
  username: process.env.SOLACE_USERNAME || 'default',
  password: process.env.SOLACE_PASSWORD || 'default'
};

const solaceService = new SolaceService(solaceConfig);
const sessionManager = new SessionManager();
const aiGenerator = new AIQuestionGenerator();

// --- API Routes ---

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    solace: solaceService.isConnected()
  });
});

/**
 * Admin login
 */
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { password } = req.body;
  console.log(`🔐 Login attempt - received: "${password}", expected: "${process.env.ADMIN_PASSWORD}"`);
  
  if (password === process.env.ADMIN_PASSWORD) {
    console.log('✅ Login successful');
    res.json({
      success: true,
      data: { token: 'admin-session-token' } // In production, use proper JWT
    } as ApiResponse);
  } else {
    console.log('❌ Login failed - password mismatch');
    res.status(401).json({
      success: false,
      error: 'Invalid password'
    } as ApiResponse);
  }
});

/**
 * Create new session
 */
app.post('/api/admin/session', (req: Request, res: Response) => {
  try {
    const { name, config } = req.body;
    const session = sessionManager.createSession(name, config);

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        code: session.code,
        name: session.name
      } as CreateSessionResponse
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session'
    } as ApiResponse);
  }
});

/**
 * List all sessions
 */
app.get('/api/admin/sessions', (req: Request, res: Response) => {
  try {
    const sessions = sessionManager.getAllSessions();
    
    const sessionList = sessions.map(session => ({
      id: session.id,
      code: session.code,
      name: session.name,
      state: session.state,
      playerCount: session.players.size,
      questionCount: session.questions.length,
      currentQuestionIndex: session.currentQuestionIndex,
      createdAt: session.createdAt
    }));

    res.json({
      success: true,
      data: { sessions: sessionList }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list sessions'
    } as ApiResponse);
  }
});

/**
 * Get session details
 */
app.get('/api/admin/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        id: session.id,
        code: session.code,
        name: session.name,
        state: session.state,
        players: Array.from(session.players.values()),
        questions: session.questions.map(q => ({
          id: q.id,
          text: q.text,
          category: q.category,
          difficulty: q.difficulty,
          timeLimit: q.timeLimit,
          points: q.points,
          roundId: q.roundId
        })),
        currentQuestionIndex: session.currentQuestionIndex,
        createdAt: session.createdAt,
        rounds: session.rounds,
        currentRoundIndex: session.currentRoundIndex
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session'
    } as ApiResponse);
  }
});

/**
 * Add questions to session (and optionally assign to a round)
 */
app.post('/api/admin/session/:sessionId/questions', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { questions, roundId } = req.body;

    const success = sessionManager.addQuestions(sessionId, questions);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // If roundId is provided, auto-assign questions to that round
    if (roundId) {
      const session = sessionManager.getSession(sessionId);
      if (session) {
        const round = session.rounds.find(r => r.id === roundId);
        if (round) {
          // Get the IDs of the newly added questions
          const newQuestionIds = questions.map((q: Question) => q.id);
          // Add these to the round's questionIds
          const updatedQuestionIds = [...round.questionIds, ...newQuestionIds];
          sessionManager.updateRound(sessionId, roundId, { questionIds: updatedQuestionIds });
          console.log(`📎 Auto-assigned ${newQuestionIds.length} questions to round "${round.name}"`);
        }
      }
    }

    res.json({
      success: true,
      data: { count: questions.length }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add questions'
    } as ApiResponse);
  }
});

/**
 * Generate questions using AI
 */
app.post('/api/admin/session/:sessionId/questions/generate', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const request: AIQuestionRequest = req.body;

    // Get session settings
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    const settings = sessionManager.getSettings(sessionId);
    if (!settings || !settings.provider || !settings.apiKey) {
      res.status(400).json({
        success: false,
        error: 'AI not configured for this session. Please configure AI settings first.'
      } as ApiResponse);
      return;
    }

    // Generate questions using session settings
    const questions = await aiGenerator.generateQuestions(request, settings);
    const success = sessionManager.addQuestions(sessionId, questions);

    if (success) {
      res.json({
        success: true,
        data: { questions }
      } as ApiResponse);
    } else {
      res.status(404).json({
        success: false,
        error: 'Failed to add questions to session'
      } as ApiResponse);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate questions'
    } as ApiResponse);
  }
});

/**
 * Get admin settings for session
 */
app.get('/api/admin/session/:sessionId/settings', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    const settings = sessionManager.getSettings(sessionId);
    res.json({
      success: true,
      data: settings || {}
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get settings'
    } as ApiResponse);
  }
});

/**
 * Update admin settings for session
 */
app.post('/api/admin/session/:sessionId/settings', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const settings: AdminSettings = req.body;

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // Validate settings
    if (settings.provider && !settings.apiKey) {
      res.status(400).json({
        success: false,
        error: 'API key is required when provider is specified'
      } as ApiResponse);
      return;
    }

    if (settings.provider === 'litellm' && !settings.baseUrl) {
      res.status(400).json({
        success: false,
        error: 'Base URL is required for LiteLLM provider'
      } as ApiResponse);
      return;
    }

    const success = sessionManager.updateSettings(sessionId, settings);
    res.json({
      success,
      data: settings
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings'
    } as ApiResponse);
  }
});

/**
 * Clear admin settings for session
 */
app.delete('/api/admin/session/:sessionId/settings', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    const success = sessionManager.clearSettings(sessionId);
    res.json({
      success,
      data: null
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear settings'
    } as ApiResponse);
  }
});

/**
 * Start session
 */
app.post('/api/admin/session/:sessionId/start', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = sessionManager.startSession(sessionId);

    if (success) {
      res.json({ success: true } as ApiResponse);
    } else {
      res.status(400).json({
        success: false,
        error: 'Cannot start session'
      } as ApiResponse);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start session'
    } as ApiResponse);
  }
});

/**
 * Release question
 */
app.post('/api/admin/session/:sessionId/release-question', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const question = sessionManager.releaseQuestion(sessionId);

    if (!question) {
      res.status(400).json({
        success: false,
        error: 'No more questions or session not active'
      } as ApiResponse);
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // Publish question to Solace (without correct answer!)
    const questionMessage: QuestionMessage = {
      question: {
        id: question.id,
        text: question.text,
        choices: question.choices,
        category: question.category,
        difficulty: question.difficulty,
        timeLimit: question.timeLimit,
        points: question.points
      },
      questionNumber: session.currentQuestionIndex + 1,
      totalQuestions: session.questions.length,
      startTime: session.currentQuestionStartTime!,
      endTime: session.currentQuestionStartTime! + (question.timeLimit * 1000),
      roundInfo: sessionManager.getRoundInfoForQuestion(sessionId)
    };

    solaceService.publish(
      `trivia/session/${sessionId}/question/released`,
      questionMessage
    );

    res.json({
      success: true,
      data: { question: questionMessage }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to release question'
    } as ApiResponse);
  }
});

/**
 * Delete session permanently
 */
app.delete('/api/admin/session/:sessionId', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const success = sessionManager.deleteSession(sessionId);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: { message: 'Session deleted' }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete session'
    } as ApiResponse);
  }
});

/**
 * Close session
 */
app.post('/api/admin/session/:sessionId/close', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const leaderboard = sessionManager.closeSession(sessionId);

    if (!leaderboard) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // Publish game ended event with leaderboard
    solaceService.publish(
      `trivia/session/${sessionId}/game/ended`,
      leaderboard
    );

    res.json({
      success: true,
      data: { leaderboard }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close session'
    } as ApiResponse);
  }
});

/**
 * Get session info (for QR code scanning)
 */
app.get('/api/session/:code/info', (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const session = sessionManager.getSessionByCode(code.toUpperCase());

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        name: session.name,
        state: session.state,
        playerCount: session.players.size
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session info'
    } as ApiResponse);
  }
});

/**
 * Join session
 */
app.post('/api/session/:code/join', (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const { nickname, avatar } = req.body as { nickname: string; avatar: PlayerAvatar };

    const session = sessionManager.getSessionByCode(code.toUpperCase());
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    const player = sessionManager.addPlayer(session.id, nickname, avatar);
    if (!player) {
      res.status(400).json({
        success: false,
        error: 'Cannot join session'
      } as ApiResponse);
      return;
    }

    // Publish player joined event to Solace
    solaceService.publish(
      `trivia/session/${session.id}/player/${player.id}/joined`,
      player
    );

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        playerId: player.id,
        reconnectToken: player.reconnectToken,
        sessionName: session.name,
        state: session.state
      } as JoinSessionResponse
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to join session'
    } as ApiResponse);
  }
});

/**
 * Get current question for a session (for players)
 */
app.get('/api/session/:sessionId/current-question', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // If game hasn't started or is closed, return waiting state
    if (session.state !== 'ACTIVE' || session.currentQuestionIndex < 0) {
      res.json({
        success: true,
        data: {
          waiting: true,
          state: session.state
        }
      } as ApiResponse);
      return;
    }

    const question = session.questions[session.currentQuestionIndex];
    if (!question) {
      res.json({
        success: true,
        data: {
          waiting: true,
          state: session.state
        }
      } as ApiResponse);
      return;
    }

    // Return question without the correct answer
    const questionMessage: QuestionMessage = {
      question: {
        id: question.id,
        text: question.text,
        choices: question.choices,
        category: question.category,
        difficulty: question.difficulty,
        timeLimit: question.timeLimit,
        points: question.points
      },
      questionNumber: session.currentQuestionIndex + 1,
      totalQuestions: session.questions.length,
      startTime: session.currentQuestionStartTime!,
      endTime: session.currentQuestionStartTime! + (question.timeLimit * 1000)
    };

    res.json({
      success: true,
      data: {
        waiting: false,
        question: questionMessage
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get current question'
    } as ApiResponse);
  }
});

/**
 * Submit answer (for players)
 */
app.post('/api/session/:sessionId/answer', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const answer = req.body as Answer;

    const scoreUpdate = sessionManager.processAnswer(sessionId, answer);

    if (!scoreUpdate) {
      res.status(400).json({
        success: false,
        error: 'Invalid answer or session'
      } as ApiResponse);
      return;
    }

    // Publish answer submitted event
    solaceService.publish(
      `trivia/session/${sessionId}/player/${answer.playerId}/answered`,
      answer
    );

    // Publish score update to Solace
    solaceService.publish(
      `trivia/session/${sessionId}/player/${answer.playerId}/scored`,
      scoreUpdate
    );

    // Publish answer stats update to Solace
    const session = sessionManager.getSession(sessionId);
    if (session && session.currentQuestionIndex >= 0) {
      let answeredCount = 0;
      const distribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
      
      session.players.forEach(player => {
        if (player.lastAnswerTime && player.lastAnswerTime >= session.currentQuestionStartTime!) {
          answeredCount++;
          // Track the answer choice in distribution
          if (player.lastAnswerChoice !== undefined && player.lastAnswerChoice >= 0 && player.lastAnswerChoice <= 3) {
            distribution[player.lastAnswerChoice]++;
          }
        }
      });

      const answerStats = {
        totalPlayers: session.players.size,
        answeredCount,
        allAnswered: answeredCount >= session.players.size && session.players.size > 0,
        distribution
      };

      solaceService.publish(
        `trivia/session/${sessionId}/stats/answersUpdated`,
        answerStats
      );
    }

    res.json({
      success: true,
      data: scoreUpdate
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to submit answer'
    } as ApiResponse);
  }
});

/**
 * Ask AI lifeline - get AI's suggestion for answer
 */
app.post('/api/lifeline/ask-ai', async (req: Request, res: Response) => {
  try {
    const { question, choices } = req.body;

    if (!question || !choices || !Array.isArray(choices) || choices.length !== 4) {
      res.status(400).json({
        success: false,
        error: 'Invalid request: question and 4 choices required'
      } as ApiResponse);
      return;
    }

    if (!aiGenerator.isAvailable()) {
      res.status(503).json({
        success: false,
        error: 'AI service not available'
      } as ApiResponse);
      return;
    }

    const result = await aiGenerator.answerQuestion(question, choices);

    res.json({
      success: true,
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Ask AI lifeline error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get AI suggestion'
    } as ApiResponse);
  }
});

/**
 * 50/50 lifeline - eliminate 2 wrong answers
 */
app.post('/api/lifeline/fifty-fifty', (req: Request, res: Response) => {
  try {
    const { sessionId, questionId } = req.body;

    if (!sessionId || !questionId) {
      res.status(400).json({
        success: false,
        error: 'Invalid request: sessionId and questionId required'
      } as ApiResponse);
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // Find the question
    const question = session.questions.find(q => q.id === questionId);
    if (!question) {
      res.status(404).json({
        success: false,
        error: 'Question not found'
      } as ApiResponse);
      return;
    }

    // Get indices of wrong answers
    const wrongIndices = [0, 1, 2, 3].filter(i => i !== question.correctIndex);
    
    // Randomly pick 2 wrong answers to eliminate
    const shuffled = wrongIndices.sort(() => Math.random() - 0.5);
    const eliminatedIndices = shuffled.slice(0, 2);

    res.json({
      success: true,
      data: { eliminatedIndices }
    } as ApiResponse);
  } catch (error) {
    console.error('50/50 lifeline error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to use 50/50 lifeline'
    } as ApiResponse);
  }
});

/**
 * Get answer stats for current question (for admin and players)
 */
app.get('/api/session/:sessionId/answer-stats', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    if (session.currentQuestionIndex < 0) {
      res.json({
        success: true,
        data: {
          totalPlayers: session.players.size,
          answeredCount: 0,
          allAnswered: false
        }
      } as ApiResponse);
      return;
    }

    const currentQuestion = session.questions[session.currentQuestionIndex];
    if (!currentQuestion) {
      res.json({
        success: true,
        data: {
          totalPlayers: session.players.size,
          answeredCount: 0,
          allAnswered: false
        }
      } as ApiResponse);
      return;
    }

    // Count players who answered current question
    let answeredCount = 0;
    const answerDistribution: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

    session.players.forEach(player => {
      if (player.lastAnswerTime && player.lastAnswerTime >= session.currentQuestionStartTime!) {
        answeredCount++;
        // Track the answer choice in distribution
        if (player.lastAnswerChoice !== undefined && player.lastAnswerChoice >= 0 && player.lastAnswerChoice <= 3) {
          answerDistribution[player.lastAnswerChoice]++;
        }
      }
    });

    res.json({
      success: true,
      data: {
        totalPlayers: session.players.size,
        answeredCount,
        allAnswered: answeredCount >= session.players.size && session.players.size > 0,
        distribution: answerDistribution
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get answer stats'
    } as ApiResponse);
  }
});

/**
 * Get leaderboard for session
 */
app.get('/api/session/:sessionId/leaderboard', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // Convert players map to array and sort by totalMoney (speed bonus included)
    const leaderboard = Array.from(session.players.values())
      .map(player => ({
        playerId: player.id,
        name: player.nickname,
        avatar: player.avatar,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalAnswers: player.totalAnswers,
        totalMoney: player.totalMoney
      }))
      .sort((a, b) => {
        // Sort by totalMoney first, then score as tiebreaker
        if (b.totalMoney !== a.totalMoney) return b.totalMoney - a.totalMoney;
        return b.score - a.score;
      });

    res.json({
      success: true,
      data: leaderboard
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get leaderboard'
    } as ApiResponse);
  }
});

// ===================
// ROUND MANAGEMENT ENDPOINTS
// ===================

/**
 * Get all rounds for a session
 */
app.get('/api/admin/session/:sessionId/rounds', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);

    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    // Populate questions for each round
    const roundsWithQuestions = session.rounds.map(round => ({
      ...round,
      questions: round.questionIds
        .map(qId => session.questions.find(q => q.id === qId))
        .filter(Boolean) // Remove any undefined
    }));

    res.json({
      success: true,
      data: {
        rounds: roundsWithQuestions,
        currentRoundIndex: session.currentRoundIndex
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get rounds'
    } as ApiResponse);
  }
});

/**
 * Create a new round
 */
app.post('/api/admin/session/:sessionId/rounds', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { name, questionIds } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: 'Round name is required'
      } as ApiResponse);
      return;
    }

    const round = sessionManager.createRound(sessionId, name, questionIds);

    if (!round) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: { round }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create round'
    } as ApiResponse);
  }
});

/**
 * Update a round
 */
app.put('/api/admin/session/:sessionId/rounds/:roundId', (req: Request, res: Response) => {
  try {
    const { sessionId, roundId } = req.params;
    const updates = req.body;

    const round = sessionManager.updateRound(sessionId, roundId, updates);

    if (!round) {
      res.status(404).json({
        success: false,
        error: 'Session or round not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: { round }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update round'
    } as ApiResponse);
  }
});

/**
 * Delete a round
 */
app.delete('/api/admin/session/:sessionId/rounds/:roundId', (req: Request, res: Response) => {
  try {
    const { sessionId, roundId } = req.params;

    const deleted = sessionManager.deleteRound(sessionId, roundId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Session or round not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: null
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete round'
    } as ApiResponse);
  }
});

/**
 * Auto-distribute questions into rounds
 */
app.post('/api/admin/session/:sessionId/rounds/auto-distribute', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { questionsPerRound } = req.body;

    const rounds = sessionManager.autoDistributeQuestions(sessionId, questionsPerRound || 5);

    res.json({
      success: true,
      data: { rounds }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to auto-distribute questions'
    } as ApiResponse);
  }
});

/**
 * Start a specific round
 */
app.post('/api/admin/session/:sessionId/rounds/:roundId/start', (req: Request, res: Response) => {
  try {
    const { sessionId, roundId } = req.params;

    const round = sessionManager.startRound(sessionId, roundId);

    if (!round) {
      res.status(404).json({
        success: false,
        error: 'Session or round not found'
      } as ApiResponse);
      return;
    }

    const session = sessionManager.getSession(sessionId);

    // Publish round started event via Solace
    const roundStartedMessage: RoundStartedMessage = {
      roundId: round.id,
      roundName: round.name,
      roundNumber: (session?.currentRoundIndex ?? 0) + 1,
      totalRounds: session?.rounds.length ?? 1,
      questionCount: round.questionIds.length,
      timestamp: Date.now()
    };

    solaceService.publish(
      `trivia/session/${sessionId}/round/started`,
      roundStartedMessage
    );

    res.json({
      success: true,
      data: { round }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start round'
    } as ApiResponse);
  }
});

/**
 * End current round (triggers break/pause)
 */
app.post('/api/admin/session/:sessionId/rounds/end-current', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const result = sessionManager.endCurrentRound(sessionId);

    if (!result) {
      res.status(404).json({
        success: false,
        error: 'Session not found or no active round'
      } as ApiResponse);
      return;
    }

    const session = sessionManager.getSession(sessionId);
    const nextRound = session?.rounds[(session?.currentRoundIndex ?? 0) + 1];

    // Publish round ended event via Solace
    const roundEndedMessage: RoundEndedMessage = {
      roundId: result.round.id,
      roundName: result.round.name,
      roundNumber: (session?.currentRoundIndex ?? 0) + 1,
      totalRounds: session?.rounds.length ?? 1,
      timestamp: Date.now(),
      leaderboard: result.leaderboard,
      nextRoundName: nextRound?.name
    };

    solaceService.publish(
      `trivia/session/${sessionId}/round/ended`,
      roundEndedMessage
    );

    res.json({
      success: true,
      data: {
        round: result.round,
        leaderboard: result.leaderboard,
        nextRound: nextRound || null
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to end round'
    } as ApiResponse);
  }
});

/**
 * Start next round (resume from break)
 */
app.post('/api/admin/session/:sessionId/rounds/start-next', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const round = sessionManager.startNextRound(sessionId);

    if (!round) {
      res.status(400).json({
        success: false,
        error: 'No more rounds available'
      } as ApiResponse);
      return;
    }

    const session = sessionManager.getSession(sessionId);

    // Publish round started event via Solace
    const roundStartedMessage: RoundStartedMessage = {
      roundId: round.id,
      roundName: round.name,
      roundNumber: (session?.currentRoundIndex ?? 0) + 1,
      totalRounds: session?.rounds.length ?? 1,
      questionCount: round.questionIds.length,
      timestamp: Date.now()
    };

    solaceService.publish(
      `trivia/session/${sessionId}/round/started`,
      roundStartedMessage
    );

    res.json({
      success: true,
      data: { round }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start next round'
    } as ApiResponse);
  }
});

// ===================
// PLAYER RECONNECTION
// ===================

/**
 * Reconnect a player using their token
 */
app.post('/api/session/:sessionId/reconnect', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        error: 'Reconnect token is required'
      } as ApiResponse);
      return;
    }

    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }

    const player = sessionManager.reconnectPlayer(token, sessionId);

    if (!player) {
      res.status(401).json({
        success: false,
        error: 'Invalid token or session mismatch'
      } as ApiResponse);
      return;
    }

    // Get current state for the player
    const currentRound = sessionManager.getCurrentRound(sessionId);
    let currentQuestion: QuestionMessage | undefined;

    if (session.state === 'ACTIVE' && session.currentQuestionIndex >= 0) {
      const question = session.questions[session.currentQuestionIndex];
      if (question) {
        currentQuestion = {
          question: {
            id: question.id,
            text: question.text,
            choices: question.choices,
            category: question.category,
            difficulty: question.difficulty,
            timeLimit: question.timeLimit,
            points: question.points
          },
          questionNumber: session.currentQuestionIndex + 1,
          totalQuestions: session.questions.length,
          startTime: session.currentQuestionStartTime!,
          endTime: session.currentQuestionStartTime! + (question.timeLimit * 1000),
          roundInfo: sessionManager.getRoundInfoForQuestion(sessionId)
        };
      }
    }

    const response: ReconnectResponse = {
      success: true,
      player,
      sessionState: session.state,
      currentRound: currentRound || undefined,
      currentQuestion
    };

    res.json({
      success: true,
      data: response
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to reconnect'
    } as ApiResponse);
  }
});

// --- Solace Event Handlers ---

// ===================
// TEMPLATE OPERATIONS
// ===================

/**
 * Get all templates (list only, without content)
 */
app.get('/api/admin/templates', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const templates = db.getAllTemplates();
    res.json({
      success: true,
      data: { templates }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates'
    } as ApiResponse);
  }
});

/**
 * Get a single template with content
 */
app.get('/api/admin/templates/:templateId', (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const db = getDatabase();
    const template = db.getTemplate(templateId);
    
    if (!template) {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      } as ApiResponse);
      return;
    }
    
    res.json({
      success: true,
      data: { template }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get template'
    } as ApiResponse);
  }
});

/**
 * Save current session rounds+questions as template
 */
app.post('/api/admin/templates', (req: Request, res: Response) => {
  try {
    const { name, description, sessionId } = req.body;
    
    if (!name || !sessionId) {
      res.status(400).json({
        success: false,
        error: 'Name and sessionId are required'
      } as ApiResponse);
      return;
    }
    
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }
    
    // Build YAML content from session rounds and questions
    const exportData = {
      name: name,
      rounds: session.rounds.map(round => ({
        name: round.name,
        questions: round.questions?.map(q => ({
          text: q.text,
          choices: q.choices,
          correctIndex: q.correctIndex,
          timeLimit: q.timeLimit,
          difficulty: q.difficulty,
          category: q.category
        })) || session.questions
          .filter(q => q.roundId === round.id)
          .map(q => ({
            text: q.text,
            choices: q.choices,
            correctIndex: q.correctIndex,
            timeLimit: q.timeLimit,
            difficulty: q.difficulty,
            category: q.category
          }))
      }))
    };
    
    const content = yaml.dump(exportData);
    const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const db = getDatabase();
    db.saveTemplate({
      id: templateId,
      name,
      description,
      content
    });
    
    res.json({
      success: true,
      data: { templateId, name }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save template'
    } as ApiResponse);
  }
});

/**
 * Delete a template
 */
app.delete('/api/admin/templates/:templateId', (req: Request, res: Response) => {
  try {
    const { templateId } = req.params;
    const db = getDatabase();
    const deleted = db.deleteTemplate(templateId);
    
    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      } as ApiResponse);
      return;
    }
    
    res.json({
      success: true,
      data: null
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete template'
    } as ApiResponse);
  }
});

// ===================
// IMPORT/EXPORT OPERATIONS
// ===================

/**
 * Export session rounds+questions as YAML
 */
app.get('/api/admin/session/:sessionId/export', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }
    
    // Build export data
    const exportData = {
      name: session.name,
      exportedAt: new Date().toISOString(),
      rounds: session.rounds.map(round => ({
        name: round.name,
        questions: round.questions?.map(q => ({
          text: q.text,
          choices: q.choices,
          correctIndex: q.correctIndex,
          timeLimit: q.timeLimit,
          difficulty: q.difficulty,
          category: q.category
        })) || session.questions
          .filter(q => q.roundId === round.id)
          .map(q => ({
            text: q.text,
            choices: q.choices,
            correctIndex: q.correctIndex,
            timeLimit: q.timeLimit,
            difficulty: q.difficulty,
            category: q.category
          }))
      }))
    };
    
    const yamlContent = yaml.dump(exportData);
    
    res.json({
      success: true,
      data: { yaml: yamlContent, filename: `${session.name.replace(/\s+/g, '_')}_export.yaml` }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export session'
    } as ApiResponse);
  }
});

/**
 * Import YAML content into session (creates rounds and questions)
 */
app.post('/api/admin/session/:sessionId/import', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { yamlContent, replaceExisting } = req.body;
    
    if (!yamlContent) {
      res.status(400).json({
        success: false,
        error: 'YAML content is required'
      } as ApiResponse);
      return;
    }
    
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }
    
    // Parse YAML
    const parsed = yaml.load(yamlContent) as any;
    
    if (!parsed.rounds || !Array.isArray(parsed.rounds)) {
      res.status(400).json({
        success: false,
        error: 'YAML must contain a "rounds" array'
      } as ApiResponse);
      return;
    }
    
    // If replacing, delete existing rounds first
    if (replaceExisting) {
      const existingRounds = [...session.rounds];
      for (const round of existingRounds) {
        sessionManager.deleteRound(sessionId, round.id);
      }
    }
    
    const createdRounds: Round[] = [];
    
    // Create rounds and questions from YAML
    for (const roundData of parsed.rounds) {
      if (!roundData.name) {
        continue; // Skip invalid rounds
      }
      
      // Create round first
      const round = sessionManager.createRound(sessionId, roundData.name, []);
      if (!round) continue;
      
      // Add questions to this round
      if (roundData.questions && Array.isArray(roundData.questions)) {
        const questions = roundData.questions.map((q: any, idx: number) => ({
          id: `q${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          text: q.text,
          choices: q.choices || [],
          correctIndex: q.correctIndex ?? 0,
          timeLimit: q.timeLimit || 30,
          points: 1000,
          difficulty: q.difficulty || 'medium',
          category: q.category,
          roundId: round.id
        }));
        
        sessionManager.addQuestions(sessionId, questions);
        
        // Update round with question IDs
        const questionIds = questions.map(q => q.id);
        sessionManager.updateRound(sessionId, round.id, { questionIds });
      }
      
      // Get updated round with questions
      const allRounds = sessionManager.getRounds(sessionId);
      const updatedRound = allRounds.find(r => r.id === round.id);
      if (updatedRound) {
        createdRounds.push(updatedRound);
      }
    }
    
    res.json({
      success: true,
      data: { 
        roundsCreated: createdRounds.length,
        rounds: createdRounds 
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to import YAML'
    } as ApiResponse);
  }
});

/**
 * Load template into session
 */
app.post('/api/admin/session/:sessionId/load-template/:templateId', (req: Request, res: Response) => {
  try {
    const { sessionId, templateId } = req.params;
    const { replaceExisting } = req.body;
    
    const db = getDatabase();
    const template = db.getTemplate(templateId);
    
    if (!template) {
      res.status(404).json({
        success: false,
        error: 'Template not found'
      } as ApiResponse);
      return;
    }
    
    // Forward to import endpoint logic
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
      return;
    }
    
    // Parse template YAML
    const parsed = yaml.load(template.content) as any;
    
    if (!parsed.rounds || !Array.isArray(parsed.rounds)) {
      res.status(400).json({
        success: false,
        error: 'Template must contain a "rounds" array'
      } as ApiResponse);
      return;
    }
    
    // If replacing, delete existing rounds first
    if (replaceExisting) {
      const existingRounds = [...session.rounds];
      for (const round of existingRounds) {
        sessionManager.deleteRound(sessionId, round.id);
      }
    }
    
    const createdRounds: Round[] = [];
    
    // Create rounds and questions from template
    for (const roundData of parsed.rounds) {
      if (!roundData.name) {
        continue;
      }
      
      const round = sessionManager.createRound(sessionId, roundData.name, []);
      if (!round) continue;
      
      if (roundData.questions && Array.isArray(roundData.questions)) {
        const questions = roundData.questions.map((q: any, idx: number) => ({
          id: `q${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`,
          text: q.text,
          choices: q.choices || [],
          correctIndex: q.correctIndex ?? 0,
          timeLimit: q.timeLimit || 30,
          points: 1000,
          difficulty: q.difficulty || 'medium',
          category: q.category,
          roundId: round.id
        }));
        
        sessionManager.addQuestions(sessionId, questions);
        
        // Update round with question IDs
        const questionIds = questions.map(q => q.id);
        sessionManager.updateRound(sessionId, round.id, { questionIds });
      }
      
      const allRounds = sessionManager.getRounds(sessionId);
      const updatedRound = allRounds.find(r => r.id === round.id);
      if (updatedRound) {
        createdRounds.push(updatedRound);
      }
    }
    
    res.json({
      success: true,
      data: { 
        templateName: template.name,
        roundsCreated: createdRounds.length,
        rounds: createdRounds 
      }
    } as ApiResponse);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load template'
    } as ApiResponse);
  }
});

/**
 * Initialize Solace subscriptions
 */
async function initializeSolace() {
  await solaceService.connect();

  // Subscribe to all answer submissions
  solaceService.subscribe('trivia/session/*/player/*/answer', (topic, payload: Answer) => {
    // Extract sessionId from topic
    const parts = topic.split('/');
    const sessionId = parts[2];

    const scoreUpdate = sessionManager.processAnswer(sessionId, payload);
    
    if (scoreUpdate) {
      // Publish score update
      solaceService.publish(
        `trivia/session/${sessionId}/player/${payload.playerId}/score`,
        scoreUpdate
      );
    }
  });

  // Subscribe to admin control commands
  solaceService.subscribe('trivia/session/*/control', (topic, payload: AdminCommand) => {
    const parts = topic.split('/');
    const sessionId = parts[2];

    console.log('Admin command received:', payload.type);
    
    // Handle different command types if needed
  });

  console.log('✅ Solace subscriptions initialized');
}

// --- Server Startup ---

async function startServer() {
  // Start HTTP server first
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Solace broker: ${solaceConfig.url}`);
  });

  // Try to connect to Solace (non-blocking)
  try {
    await initializeSolace();
  } catch (error) {
    console.warn('⚠️  Solace connection failed - real-time features disabled');
    console.warn('   Server will continue to run with limited functionality');
    console.warn('   Start a Solace broker to enable full features');
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  solaceService.disconnect();
  process.exit(0);
});

startServer();
