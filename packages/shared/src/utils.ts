import type { Question, ScoreUpdate } from './types.js';

/**
 * Generates a random 6-character alphanumeric session code
 */
export function generateSessionCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous characters
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Validates a session code format
 */
export function isValidSessionCode(code: string): boolean {
  return /^[A-Z0-9]{6}$/.test(code);
}

/**
 * Calculates score for an answer based on correctness and time taken
 * Faster answers get more points (Kahoot-style scoring)
 */
export function calculateScore(
  correct: boolean,
  basePoints: number,
  timeTaken: number,
  timeLimit: number,
  bonusMultiplier: number = 0.5
): number {
  if (!correct) return 0;
  
  // Calculate time bonus: faster = more points
  // Max bonus is basePoints * bonusMultiplier
  const timeRatio = Math.max(0, (timeLimit - timeTaken) / timeLimit);
  const timeBonus = Math.floor(basePoints * bonusMultiplier * timeRatio);
  
  return basePoints + timeBonus;
}

/**
 * Generates a unique player ID
 */
export function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a unique question ID
 */
export function generateQuestionId(): string {
  return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a unique session ID
 */
export function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sanitizes nickname to prevent XSS and ensure valid format
 */
export function sanitizeNickname(nickname: string): string {
  return nickname
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 20); // Max 20 characters
}

/**
 * Formats time in MM:SS format
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Determines message type from Solace topic for debug viewer
 */
export function getMessageTypeFromTopic(topic: string): 'question' | 'answer' | 'score' | 'control' | 'player' | 'leaderboard' | 'other' {
  if (topic.includes('/question')) return 'question';
  if (topic.includes('/answer')) return 'answer';
  if (topic.includes('/score')) return 'score';
  if (topic.includes('/control')) return 'control';
  if (topic.includes('/players')) return 'player';
  if (topic.includes('/leaderboard')) return 'leaderboard';
  return 'other';
}

/**
 * Replaces {sessionId} placeholder in topic pattern with actual session ID
 */
export function replaceTopicPlaceholder(pattern: string, sessionId: string): string {
  return pattern.replace('{sessionId}', sessionId);
}

/**
 * Shuffles an array (Fisher-Yates algorithm)
 * Useful for randomizing answer choices
 */
export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Creates a deep clone of an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Delays execution for specified milliseconds
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculates accuracy percentage
 */
export function calculateAccuracy(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

/**
 * Money ladder for WWTBAM theme - maps question levels to prize amounts
 */
export const MONEY_LADDER = [
  { level: 1, amount: 100 },
  { level: 2, amount: 200 },
  { level: 3, amount: 300 },
  { level: 4, amount: 500 },
  { level: 5, amount: 1000 },
  { level: 6, amount: 2000 },
  { level: 7, amount: 4000 },
  { level: 8, amount: 8000 },
  { level: 9, amount: 16000 },
  { level: 10, amount: 32000 },
  { level: 11, amount: 64000 },
  { level: 12, amount: 125000 },
  { level: 13, amount: 250000 },
  { level: 14, amount: 500000 },
  { level: 15, amount: 1000000 },
];

/**
 * Converts a score/points to money amount based on question progression
 * Used for WWTBAM theme display
 */
export function scoreToMoney(questionNumber: number, totalQuestions: number): number {
  // Map the question number to the money ladder
  const ladderIndex = Math.min(questionNumber - 1, MONEY_LADDER.length - 1);
  if (ladderIndex < 0) return 0;
  
  // Scale to available ladder if fewer total questions
  const scaledIndex = Math.floor((ladderIndex / totalQuestions) * Math.min(totalQuestions, MONEY_LADDER.length));
  return MONEY_LADDER[Math.min(scaledIndex, MONEY_LADDER.length - 1)]?.amount || 0;
}

/**
 * Formats a number as money with proper commas and symbol
 */
export function formatMoney(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}K`;
  }
  return `$${amount.toLocaleString('en-US')}`;
}

/**
 * Converts raw score points to displayable money value
 * Maps based on correct answers (questions answered correctly)
 */
export function pointsToMoney(correctAnswers: number): number {
  if (correctAnswers <= 0) return 0;
  const ladderIndex = Math.min(correctAnswers - 1, MONEY_LADDER.length - 1);
  return MONEY_LADDER[ladderIndex]?.amount || 0;
}

/**
 * Calculates money earned for a question with speed bonus multiplier
 * Faster answers get higher multiplier (1.0x to maxMultiplier)
 * 
 * @param questionIndex - 0-based index of the question in the game
 * @param timeTaken - Time in seconds the player took to answer
 * @param timeLimit - Total time limit for the question in seconds
 * @param maxMultiplier - Maximum multiplier for instant answers (default 1.5 = 50% bonus)
 * @returns Money amount with speed bonus applied
 */
export function calculateMoneyWithSpeedBonus(
  questionIndex: number,
  timeTaken: number,
  timeLimit: number,
  maxMultiplier: number = 1.5
): number {
  if (questionIndex < 0 || questionIndex >= MONEY_LADDER.length) return 0;
  
  const baseAmount = MONEY_LADDER[questionIndex]?.amount || 0;
  
  // Calculate speed multiplier: faster = higher multiplier
  // timeRatio goes from 1.0 (instant) to 0.0 (at time limit)
  const timeRatio = Math.max(0, Math.min(1, (timeLimit - timeTaken) / timeLimit));
  
  // Multiplier scales from 1.0 (slowest) to maxMultiplier (fastest)
  const multiplier = 1 + (maxMultiplier - 1) * timeRatio;
  
  return Math.floor(baseAmount * multiplier);
}

/**
 * Generates a unique round ID
 */
export function generateRoundId(): string {
  return `round_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generates a reconnect token for player session persistence
 * Uses a longer, more secure format than regular IDs
 */
export function generateReconnectToken(): string {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(Math.random().toString(36).substr(2, 8));
  }
  return segments.join('-');
}
