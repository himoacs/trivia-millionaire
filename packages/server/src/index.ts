import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { SolaceService } from './services/solace.js';
import { SessionManager } from './services/session.js';
import { AIQuestionGenerator } from './services/ai.js';
import type {
  Answer,
  AdminCommand,
  PlayerEvent,
  QuestionMessage,
  PlayerAvatar,
  ApiResponse,
  CreateSessionResponse,
  JoinSessionResponse,
  AIQuestionRequest
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

const aiConfig = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  litellmBaseUrl: process.env.LITELLM_BASE_URL,
  litellmApiKey: process.env.LITELLM_API_KEY,
  defaultModel: process.env.LITELLM_MODEL || 'gpt-3.5-turbo'
};

const solaceService = new SolaceService(solaceConfig);
const sessionManager = new SessionManager();
const aiGenerator = new AIQuestionGenerator(aiConfig);

// --- API Routes ---

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    solace: solaceService.isConnected(),
    ai: aiGenerator.isAvailable()
  });
});

/**
 * Admin login
 */
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { password } = req.body;
  
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({
      success: true,
      data: { token: 'admin-session-token' } // In production, use proper JWT
    } as ApiResponse);
  } else {
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
          points: q.points
        })),
        currentQuestionIndex: session.currentQuestionIndex,
        createdAt: session.createdAt
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
 * Add questions to session
 */
app.post('/api/admin/session/:sessionId/questions', (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { questions } = req.body;

    const success = sessionManager.addQuestions(sessionId, questions);

    if (success) {
      res.json({
        success: true,
        data: { count: questions.length }
      } as ApiResponse);
    } else {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      } as ApiResponse);
    }
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

    const questions = await aiGenerator.generateQuestions(request);
    const success = sessionManager.addQuestions(sessionId, questions);

    if (success) {
      res.json({
        success: true,
        data: { questions }
      } as ApiResponse);
    } else {
      res.status(404).json({
        success: false,
        error: 'Session not found'
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
      endTime: session.currentQuestionStartTime! + (question.timeLimit * 1000)
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

    // Convert players map to array and sort by score
    const leaderboard = Array.from(session.players.values())
      .map(player => ({
        playerId: player.id,
        name: player.name,
        avatar: player.avatar,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalAnswers: player.totalAnswers
      }))
      .sort((a, b) => b.score - a.score); // Sort by score descending

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

// --- Solace Event Handlers ---

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
    console.log(`🤖 AI provider: ${aiConfig.defaultModel}`);
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
