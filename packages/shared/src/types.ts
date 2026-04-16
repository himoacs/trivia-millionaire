// Session states
export type SessionState = 'LOBBY' | 'ACTIVE' | 'CLOSED';

// Player avatar options
export type PlayerAvatar = 
  | 'robot' 
  | 'alien' 
  | 'astronaut' 
  | 'cat' 
  | 'dog' 
  | 'fox' 
  | 'panda' 
  | 'unicorn';

// Avatar to emoji mapping
export const AVATAR_EMOJIS: Record<PlayerAvatar, string> = {
  robot: '🤖',
  alien: '👽',
  astronaut: '🚀',
  cat: '🐱',
  dog: '🐶',
  fox: '🦊',
  panda: '🐼',
  unicorn: '🦄'
};

// Helper function to get emoji from avatar name
export function getAvatarEmoji(avatar: PlayerAvatar | string): string {
  return AVATAR_EMOJIS[avatar as PlayerAvatar] || '🤖';
}

// Player representation
export interface Player {
  id: string;
  nickname: string;
  avatar: PlayerAvatar;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  totalMoney: number; // Cumulative money earned with speed bonuses
  connectedAt: number;
  lastAnswerTime?: number;
  lastAnswerChoice?: number;
}

// Question difficulty levels
export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

// Question category
export type QuestionCategory = 
  | 'general' 
  | 'science' 
  | 'history' 
  | 'geography' 
  | 'sports' 
  | 'entertainment' 
  | 'technology';

// Multiple choice question
export interface Question {
  id: string;
  text: string;
  choices: string[];
  correctIndex: number;
  category?: QuestionCategory;
  difficulty?: QuestionDifficulty;
  timeLimit: number; // in seconds
  points: number; // base points for correct answer
}

// Answer submission from player
export interface Answer {
  questionId: string;
  playerId: string;
  choiceIndex: number;
  timestamp: number;
  timeTaken: number; // seconds taken to answer
}

// Score update for individual player
export interface ScoreUpdate {
  playerId: string;
  questionId: string;
  correct: boolean;
  pointsEarned: number;
  totalScore: number;
  timeTaken: number;
  moneyEarned: number; // Money earned this question (with speed bonus)
  totalMoney: number;  // Cumulative money earned
}

// Game session
export interface Session {
  id: string;
  code: string; // 6-character join code
  name: string;
  state: SessionState;
  createdAt: number;
  players: Map<string, Player>;
  questions: Question[];
  currentQuestionIndex: number;
  currentQuestionStartTime?: number;
  config: SessionConfig;
}

// Session configuration
export interface SessionConfig {
  defaultTimeLimit: number; // default time per question in seconds
  pointsPerQuestion: number; // base points
  timeBonusMultiplier: number; // multiplier for time-based bonus
  maxPlayers: number;
}

// Leaderboard entry
export interface LeaderboardEntry {
  playerId: string;
  nickname: string;
  avatar: PlayerAvatar;
  score: number;
  correctAnswers: number;
  totalMoney: number; // Cumulative money earned with speed bonuses
  rank: number;
  averageTime?: number;
}

// Full leaderboard
export interface Leaderboard {
  sessionId: string;
  sessionName: string;
  entries: LeaderboardEntry[];
  totalQuestions: number;
  completedAt: number;
}

// Scorecard for individual player (used for sharing)
export interface ScoreCard {
  player: Player;
  rank: number;
  totalPlayers: number;
  sessionName: string;
  accuracy: number; // percentage
  averageTime: number; // seconds
  fastestAnswer: number; // seconds
  completedAt: number;
}

// --- Solace Message Payloads ---

// Admin control commands
export type AdminCommand = 
  | { type: 'START_QUESTION'; questionIndex: number; timestamp: number }
  | { type: 'CLOSE_SESSION'; timestamp: number }
  | { type: 'KICK_PLAYER'; playerId: string };

// Player join/leave events
export interface PlayerEvent {
  type: 'JOIN' | 'LEAVE';
  player: Player;
  timestamp: number;
}

// Question broadcast message
export interface QuestionMessage {
  question: Omit<Question, 'correctIndex'>; // Don't send correct answer to clients!
  questionNumber: number;
  totalQuestions: number;
  startTime: number; // Server timestamp when question starts
  endTime: number; // Server timestamp when question ends
}

// Message for Solace debug panel
export interface SolaceMessage {
  id: string;
  topic: string;
  payload: any;
  timestamp: number;
  messageType: 'question' | 'answer' | 'score' | 'control' | 'player' | 'leaderboard' | 'other';
}

// AI Question generation request
export interface AIQuestionRequest {
  count: number;
  category?: QuestionCategory;
  difficulty?: QuestionDifficulty;
  provider?: 'openai' | 'anthropic' | 'litellm';
  topic?: string;
  docs?: string;
  // User-provided configuration (overrides server defaults)
  userApiKey?: string;
  userBaseUrl?: string;
  userModel?: string;
  userProvider?: 'openai' | 'anthropic' | 'litellm';
}

// Topic subscription for debug panel
export interface TopicSubscription {
  pattern: string;
  description: string;
  wildcard: boolean;
}

// Preset topic subscriptions for easy demo
export const PRESET_SUBSCRIPTIONS: TopicSubscription[] = [
  {
    pattern: 'trivia/session/{sessionId}/>',
    description: 'All events for this session',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/player/>',
    description: 'All player events (joined, answered, scored)',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/player/*/joined',
    description: 'Player joined events',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/player/*/answered',
    description: 'Answer submitted events',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/player/*/scored',
    description: 'Score update events',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/question/>',
    description: 'All question events',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/question/released',
    description: 'Question released events',
    wildcard: false
  },
  {
    pattern: 'trivia/session/{sessionId}/stats/>',
    description: 'All statistics events',
    wildcard: true
  },
  {
    pattern: 'trivia/session/{sessionId}/answer-stats',
    description: 'Real-time answer statistics',
    wildcard: false
  },
  {
    pattern: 'trivia/session/{sessionId}/leaderboard',
    description: 'Final leaderboard (game end)',
    wildcard: false
  },
  {
    pattern: 'trivia/>',
    description: 'All trivia game messages (all sessions)',
    wildcard: true
  }
];

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateSessionResponse {
  sessionId: string;
  code: string;
  name: string;
}

export interface JoinSessionResponse {
  sessionId: string;
  playerId: string;
  sessionName: string;
  state: SessionState;
}
