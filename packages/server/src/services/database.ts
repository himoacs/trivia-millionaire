import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import type {
  Session,
  Player,
  Question,
  Round,
  SessionConfig,
  SessionState,
  RoundState,
  PlayerAvatar,
  AdminSettings
} from '@trivia-millionaire/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path (relative to server package)
const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, '../../data/trivia.db');

/**
 * SQLite Database Service for persisting game state
 */
export class DatabaseService {
  private db: Database.Database;

  constructor() {
    // Ensure data directory exists
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.db.pragma('journal_mode = WAL'); // Better performance
    this.initSchema();
    console.log(`📦 Database initialized at ${DB_PATH}`);
  }

  /**
   * Initialize database schema
   */
  private initSchema(): void {
    this.db.exec(`
      -- Sessions table
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'LOBBY',
        created_at INTEGER NOT NULL,
        config TEXT NOT NULL,
        settings TEXT,
        current_question_index INTEGER DEFAULT -1,
        current_question_start_time INTEGER,
        current_round_index INTEGER DEFAULT -1
      );

      -- Rounds table
      CREATE TABLE IF NOT EXISTS rounds (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        name TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'PENDING',
        position INTEGER NOT NULL,
        started_at INTEGER,
        completed_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- Questions table
      CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        round_id TEXT,
        text TEXT NOT NULL,
        choices TEXT NOT NULL,
        correct_index INTEGER NOT NULL,
        category TEXT,
        difficulty TEXT,
        time_limit INTEGER NOT NULL,
        points INTEGER NOT NULL,
        position INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE SET NULL
      );

      -- Players table
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        nickname TEXT NOT NULL,
        avatar TEXT NOT NULL,
        score INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        total_answers INTEGER DEFAULT 0,
        total_money INTEGER DEFAULT 0,
        connected_at INTEGER NOT NULL,
        last_answer_time INTEGER,
        last_answer_choice INTEGER,
        reconnect_token TEXT UNIQUE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      -- Player round scores (tracks money earned per round)
      CREATE TABLE IF NOT EXISTS player_round_scores (
        player_id TEXT NOT NULL,
        round_id TEXT NOT NULL,
        money_earned INTEGER DEFAULT 0,
        correct_answers INTEGER DEFAULT 0,
        PRIMARY KEY (player_id, round_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_sessions_code ON sessions(code);
      CREATE INDEX IF NOT EXISTS idx_sessions_state ON sessions(state);
      CREATE INDEX IF NOT EXISTS idx_players_session ON players(session_id);
      CREATE INDEX IF NOT EXISTS idx_players_token ON players(reconnect_token);
      CREATE INDEX IF NOT EXISTS idx_questions_session ON questions(session_id);
      CREATE INDEX IF NOT EXISTS idx_questions_round ON questions(round_id);
      CREATE INDEX IF NOT EXISTS idx_rounds_session ON rounds(session_id);

      -- Question templates (saved sets of rounds + questions for reuse)
      CREATE TABLE IF NOT EXISTS question_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
  }

  // ===================
  // SESSION OPERATIONS
  // ===================

  saveSession(session: Session): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO sessions 
      (id, code, name, state, created_at, config, settings, current_question_index, current_question_start_time, current_round_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id,
      session.code,
      session.name,
      session.state,
      session.createdAt,
      JSON.stringify(session.config),
      session.settings ? JSON.stringify(session.settings) : null,
      session.currentQuestionIndex,
      session.currentQuestionStartTime || null,
      session.currentRoundIndex
    );
  }

  getSession(sessionId: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as any;
    if (!row) return null;
    return this.rowToSession(row);
  }

  getSessionByCode(code: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE code = ?').get(code) as any;
    if (!row) return null;
    return this.rowToSession(row);
  }

  getAllSessions(): Session[] {
    const rows = this.db.prepare('SELECT * FROM sessions ORDER BY created_at DESC').all() as any[];
    return rows.map(row => this.rowToSession(row));
  }

  deleteSession(sessionId: string): boolean {
    const result = this.db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return result.changes > 0;
  }

  updateSessionState(sessionId: string, state: SessionState): void {
    this.db.prepare('UPDATE sessions SET state = ? WHERE id = ?').run(state, sessionId);
  }

  updateSessionQuestionIndex(sessionId: string, index: number, startTime?: number): void {
    this.db.prepare(
      'UPDATE sessions SET current_question_index = ?, current_question_start_time = ? WHERE id = ?'
    ).run(index, startTime || null, sessionId);
  }

  updateSessionRoundIndex(sessionId: string, index: number): void {
    this.db.prepare('UPDATE sessions SET current_round_index = ? WHERE id = ?').run(index, sessionId);
  }

  updateSessionSettings(sessionId: string, settings: AdminSettings | null): void {
    this.db.prepare('UPDATE sessions SET settings = ? WHERE id = ?').run(
      settings ? JSON.stringify(settings) : null,
      sessionId
    );
  }

  private rowToSession(row: any): Session {
    const players = this.getPlayers(row.id);
    const questions = this.getQuestions(row.id);
    const rounds = this.getRounds(row.id);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      state: row.state as SessionState,
      createdAt: row.created_at,
      config: JSON.parse(row.config) as SessionConfig,
      settings: row.settings ? JSON.parse(row.settings) : undefined,
      currentQuestionIndex: row.current_question_index,
      currentQuestionStartTime: row.current_question_start_time || undefined,
      currentRoundIndex: row.current_round_index,
      players: new Map(players.map(p => [p.id, p])),
      questions,
      rounds
    };
  }

  // ===================
  // PLAYER OPERATIONS
  // ===================

  savePlayer(sessionId: string, player: Player): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO players 
      (id, session_id, nickname, avatar, score, correct_answers, total_answers, total_money, 
       connected_at, last_answer_time, last_answer_choice, reconnect_token)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      player.id,
      sessionId,
      player.nickname,
      player.avatar,
      player.score,
      player.correctAnswers,
      player.totalAnswers,
      player.totalMoney,
      player.connectedAt,
      player.lastAnswerTime || null,
      player.lastAnswerChoice ?? null,
      player.reconnectToken || null
    );
  }

  getPlayer(playerId: string): (Player & { sessionId: string }) | null {
    const row = this.db.prepare('SELECT * FROM players WHERE id = ?').get(playerId) as any;
    if (!row) return null;
    return { ...this.rowToPlayer(row), sessionId: row.session_id };
  }

  getPlayerByToken(token: string): (Player & { sessionId: string }) | null {
    const row = this.db.prepare('SELECT * FROM players WHERE reconnect_token = ?').get(token) as any;
    if (!row) return null;
    return { ...this.rowToPlayer(row), sessionId: row.session_id };
  }

  getPlayers(sessionId: string): Player[] {
    const rows = this.db.prepare('SELECT * FROM players WHERE session_id = ?').all(sessionId) as any[];
    return rows.map(row => this.rowToPlayer(row));
  }

  deletePlayer(playerId: string): boolean {
    const result = this.db.prepare('DELETE FROM players WHERE id = ?').run(playerId);
    return result.changes > 0;
  }

  updatePlayerScore(playerId: string, score: number, totalMoney: number, correctAnswers: number, totalAnswers: number): void {
    this.db.prepare(`
      UPDATE players 
      SET score = ?, total_money = ?, correct_answers = ?, total_answers = ?
      WHERE id = ?
    `).run(score, totalMoney, correctAnswers, totalAnswers, playerId);
  }

  updatePlayerAnswer(playerId: string, answerTime: number, answerChoice: number): void {
    this.db.prepare(`
      UPDATE players 
      SET last_answer_time = ?, last_answer_choice = ?
      WHERE id = ?
    `).run(answerTime, answerChoice, playerId);
  }

  private rowToPlayer(row: any): Player {
    const roundScores = this.getPlayerRoundScores(row.id);
    return {
      id: row.id,
      nickname: row.nickname,
      avatar: row.avatar as PlayerAvatar,
      score: row.score,
      correctAnswers: row.correct_answers,
      totalAnswers: row.total_answers,
      totalMoney: row.total_money,
      connectedAt: row.connected_at,
      lastAnswerTime: row.last_answer_time || undefined,
      lastAnswerChoice: row.last_answer_choice ?? undefined,
      reconnectToken: row.reconnect_token || undefined,
      roundScores: Object.keys(roundScores).length > 0 ? roundScores : undefined
    };
  }

  // ===================
  // QUESTION OPERATIONS
  // ===================

  saveQuestion(sessionId: string, question: Question, position: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO questions 
      (id, session_id, round_id, text, choices, correct_index, category, difficulty, time_limit, points, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      question.id,
      sessionId,
      question.roundId || null,
      question.text,
      JSON.stringify(question.choices),
      question.correctIndex,
      question.category || null,
      question.difficulty || null,
      question.timeLimit,
      question.points,
      position
    );
  }

  saveQuestions(sessionId: string, questions: Question[]): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO questions 
      (id, session_id, round_id, text, choices, correct_index, category, difficulty, time_limit, points, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction((qs: Question[]) => {
      qs.forEach((q, index) => {
        stmt.run(
          q.id,
          sessionId,
          q.roundId || null,
          q.text,
          JSON.stringify(q.choices),
          q.correctIndex,
          q.category || null,
          q.difficulty || null,
          q.timeLimit,
          q.points,
          index
        );
      });
    });

    transaction(questions);
  }

  getQuestions(sessionId: string): Question[] {
    const rows = this.db.prepare(
      'SELECT * FROM questions WHERE session_id = ? ORDER BY position'
    ).all(sessionId) as any[];
    return rows.map(row => this.rowToQuestion(row));
  }

  getQuestionsByRound(roundId: string): Question[] {
    const rows = this.db.prepare(
      'SELECT * FROM questions WHERE round_id = ? ORDER BY position'
    ).all(roundId) as any[];
    return rows.map(row => this.rowToQuestion(row));
  }

  deleteQuestion(questionId: string): boolean {
    const result = this.db.prepare('DELETE FROM questions WHERE id = ?').run(questionId);
    return result.changes > 0;
  }

  updateQuestionRound(questionId: string, roundId: string | null): void {
    this.db.prepare('UPDATE questions SET round_id = ? WHERE id = ?').run(roundId, questionId);
  }

  private rowToQuestion(row: any): Question {
    return {
      id: row.id,
      text: row.text,
      choices: JSON.parse(row.choices),
      correctIndex: row.correct_index,
      category: row.category || undefined,
      difficulty: row.difficulty || undefined,
      timeLimit: row.time_limit,
      points: row.points,
      roundId: row.round_id || undefined
    };
  }

  // ===================
  // ROUND OPERATIONS
  // ===================

  saveRound(sessionId: string, round: Round, position: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO rounds 
      (id, session_id, name, state, position, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      round.id,
      sessionId,
      round.name,
      round.state,
      position,
      round.startedAt || null,
      round.completedAt || null
    );
  }

  getRounds(sessionId: string): Round[] {
    const rows = this.db.prepare(
      'SELECT * FROM rounds WHERE session_id = ? ORDER BY position'
    ).all(sessionId) as any[];
    return rows.map(row => this.rowToRound(row));
  }

  getRound(roundId: string): Round | null {
    const row = this.db.prepare('SELECT * FROM rounds WHERE id = ?').get(roundId) as any;
    if (!row) return null;
    return this.rowToRound(row);
  }

  updateRoundState(roundId: string, state: RoundState, timestamp?: number): void {
    if (state === 'ACTIVE') {
      this.db.prepare('UPDATE rounds SET state = ?, started_at = ? WHERE id = ?')
        .run(state, timestamp || Date.now(), roundId);
    } else if (state === 'COMPLETED') {
      this.db.prepare('UPDATE rounds SET state = ?, completed_at = ? WHERE id = ?')
        .run(state, timestamp || Date.now(), roundId);
    } else {
      this.db.prepare('UPDATE rounds SET state = ? WHERE id = ?').run(state, roundId);
    }
  }

  deleteRound(roundId: string): boolean {
    // First, unassign questions from this round
    this.db.prepare('UPDATE questions SET round_id = NULL WHERE round_id = ?').run(roundId);
    const result = this.db.prepare('DELETE FROM rounds WHERE id = ?').run(roundId);
    return result.changes > 0;
  }

  private rowToRound(row: any): Round {
    // Get questions for this round with full details
    const questionRows = this.db.prepare(
      'SELECT * FROM questions WHERE round_id = ? ORDER BY position'
    ).all(row.id) as any[];

    const questions = questionRows.map(q => this.rowToQuestion(q));

    return {
      id: row.id,
      name: row.name,
      state: row.state as RoundState,
      questionIds: questions.map(q => q.id),
      questions, // Include full question objects for unified view
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined
    };
  }

  // ===================
  // ROUND SCORE OPERATIONS
  // ===================

  savePlayerRoundScore(playerId: string, roundId: string, moneyEarned: number, correctAnswers: number): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO player_round_scores 
      (player_id, round_id, money_earned, correct_answers)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(playerId, roundId, moneyEarned, correctAnswers);
  }

  getPlayerRoundScores(playerId: string): Record<string, number> {
    const rows = this.db.prepare(
      'SELECT round_id, money_earned FROM player_round_scores WHERE player_id = ?'
    ).all(playerId) as any[];
    
    const scores: Record<string, number> = {};
    rows.forEach(row => {
      scores[row.round_id] = row.money_earned;
    });
    return scores;
  }

  addToPlayerRoundScore(playerId: string, roundId: string, moneyEarned: number, isCorrect: boolean): void {
    // First try to get existing score
    const existing = this.db.prepare(
      'SELECT money_earned, correct_answers FROM player_round_scores WHERE player_id = ? AND round_id = ?'
    ).get(playerId, roundId) as any;

    if (existing) {
      this.db.prepare(`
        UPDATE player_round_scores 
        SET money_earned = money_earned + ?, correct_answers = correct_answers + ?
        WHERE player_id = ? AND round_id = ?
      `).run(moneyEarned, isCorrect ? 1 : 0, playerId, roundId);
    } else {
      this.savePlayerRoundScore(playerId, roundId, moneyEarned, isCorrect ? 1 : 0);
    }
  }

  // ===================
  // UTILITY
  // ===================

  close(): void {
    this.db.close();
  }

  /**
   * Clean up old closed sessions (optional maintenance)
   */
  cleanupOldSessions(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = Date.now() - olderThanMs;
    const result = this.db.prepare(
      'DELETE FROM sessions WHERE state = ? AND created_at < ?'
    ).run('CLOSED', cutoff);
    return result.changes;
  }

  // ===================
  // TEMPLATE OPERATIONS
  // ===================

  saveTemplate(template: { id: string; name: string; description?: string; content: string }): void {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO question_templates 
      (id, name, description, content, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Check if exists to preserve created_at
    const existing = this.getTemplate(template.id);
    const createdAt = existing?.createdAt || now;

    stmt.run(
      template.id,
      template.name,
      template.description || null,
      template.content,
      createdAt,
      now
    );
  }

  getTemplate(templateId: string): { id: string; name: string; description?: string; content: string; createdAt: number; updatedAt: number } | null {
    const row = this.db.prepare('SELECT * FROM question_templates WHERE id = ?').get(templateId) as any;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  getAllTemplates(): { id: string; name: string; description?: string; createdAt: number; updatedAt: number }[] {
    const rows = this.db.prepare('SELECT id, name, description, created_at, updated_at FROM question_templates ORDER BY updated_at DESC').all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  deleteTemplate(templateId: string): boolean {
    const result = this.db.prepare('DELETE FROM question_templates WHERE id = ?').run(templateId);
    return result.changes > 0;
  }
}

// Singleton instance
let dbInstance: DatabaseService | null = null;

export function getDatabase(): DatabaseService {
  if (!dbInstance) {
    dbInstance = new DatabaseService();
  }
  return dbInstance;
}
