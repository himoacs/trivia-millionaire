import type {
  Session,
  Player,
  Question,
  Answer,
  ScoreUpdate,
  SessionConfig,
  SessionState,
  PlayerAvatar,
  Leaderboard,
  LeaderboardEntry,
  AdminSettings
} from '@trivia-millionaire/shared';
import {
  generateSessionId,
  generateSessionCode,
  generatePlayerId,
  calculateScore,
  calculateMoneyWithSpeedBonus,
  sanitizeNickname
} from '@trivia-millionaire/shared';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private sessionsByCodes: Map<string, string> = new Map(); // code -> sessionId

  /**
   * Create a new game session
   */
  createSession(name: string, config?: Partial<SessionConfig>): Session {
    const sessionId = generateSessionId();
    const code = generateSessionCode();

    const defaultConfig: SessionConfig = {
      defaultTimeLimit: 30,
      pointsPerQuestion: 1000,
      timeBonusMultiplier: 0.5,
      maxPlayers: 100
    };

    const session: Session = {
      id: sessionId,
      code,
      name: name || `Trivia Game ${code}`,
      state: 'LOBBY',
      createdAt: Date.now(),
      players: new Map(),
      questions: [],
      currentQuestionIndex: -1,
      config: { ...defaultConfig, ...config }
    };

    this.sessions.set(sessionId, session);
    this.sessionsByCodes.set(code, sessionId);

    console.log(`🎮 Created session: ${session.name} (${code})`);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get session by code
   */
  getSessionByCode(code: string): Session | undefined {
    const sessionId = this.sessionsByCodes.get(code);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  /**
   * Add player to session
   */
  addPlayer(
    sessionId: string,
    nickname: string,
    avatar: PlayerAvatar
  ): Player | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    // Allow joining in LOBBY or ACTIVE state, but not CLOSED
    if (session.state === 'CLOSED') {
      console.error('Cannot join session - game has ended');
      return null;
    }

    if (session.players.size >= session.config.maxPlayers) {
      console.error('Session is full');
      return null;
    }

    const playerId = generatePlayerId();
    const player: Player = {
      id: playerId,
      nickname: sanitizeNickname(nickname),
      avatar,
      score: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      totalMoney: 0,
      connectedAt: Date.now()
    };

    session.players.set(playerId, player);
    const lateJoin = session.state === 'ACTIVE' ? ' (late join)' : '';
    console.log(`👤 Player joined ${session.code}: ${player.nickname}${lateJoin}`);
    return player;
  }

  /**
   * Remove player from session
   */
  removePlayer(sessionId: string, playerId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const removed = session.players.delete(playerId);
    if (removed) {
      console.log(`👋 Player left ${session.code}: ${playerId}`);
    }
    return removed;
  }

  /**
   * Add questions to session
   */
  addQuestions(sessionId: string, questions: Question[]): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.questions.push(...questions);
    console.log(`📝 Added ${questions.length} questions to ${session.code}`);
    return true;
  }

  /**
   * Start session
   */
  startSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    if (session.questions.length === 0) {
      console.error('Cannot start session - no questions');
      return false;
    }

    session.state = 'ACTIVE';
    console.log(`▶️  Started session ${session.code}`);
    return true;
  }

  /**
   * Release next question
   */
  releaseQuestion(sessionId: string): Question | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.state !== 'ACTIVE') return null;

    session.currentQuestionIndex++;
    
    if (session.currentQuestionIndex >= session.questions.length) {
      console.log('No more questions');
      return null;
    }

    const question = session.questions[session.currentQuestionIndex];
    session.currentQuestionStartTime = Date.now();
    
    console.log(`❓ Released question ${session.currentQuestionIndex + 1} of ${session.questions.length}`);
    return question;
  }

  /**
   * Process answer and update score
   */
  processAnswer(sessionId: string, answer: Answer): ScoreUpdate | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const player = session.players.get(answer.playerId);
    if (!player) return null;

    const question = session.questions[session.currentQuestionIndex];
    if (!question || question.id !== answer.questionId) {
      console.error('Invalid question ID');
      return null;
    }

    // Check if player already answered this question
    if (player.lastAnswerTime && player.lastAnswerTime >= session.currentQuestionStartTime!) {
      console.log('Player already answered this question');
      return null;
    }

    // Store the answer choice
    player.lastAnswerChoice = answer.choiceIndex;

    const correct = answer.choiceIndex === question.correctIndex;
    const pointsEarned = calculateScore(
      correct,
      session.config.pointsPerQuestion,
      answer.timeTaken,
      question.timeLimit,
      session.config.timeBonusMultiplier
    );

    // Calculate money earned with speed bonus (only for correct answers)
    const moneyEarned = correct 
      ? calculateMoneyWithSpeedBonus(
          session.currentQuestionIndex,
          answer.timeTaken,
          question.timeLimit,
          1.5 // Max 50% speed bonus
        )
      : 0;

    // Update player stats
    player.score += pointsEarned;
    player.totalMoney += moneyEarned;
    player.lastAnswerTime = answer.timestamp;
    player.totalAnswers++;
    if (correct) {
      player.correctAnswers++;
    }

    const scoreUpdate: ScoreUpdate = {
      playerId: answer.playerId,
      questionId: answer.questionId,
      correct,
      pointsEarned,
      totalScore: player.score,
      timeTaken: answer.timeTaken,
      moneyEarned,
      totalMoney: player.totalMoney
    };

    console.log(`💯 ${player.nickname}: ${correct ? '✓' : '✗'} ${pointsEarned} pts, $${moneyEarned} (total: $${player.totalMoney})`);
    return scoreUpdate;
  }

  /**
   * Close session and generate leaderboard
   */
  closeSession(sessionId: string): Leaderboard | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.state = 'CLOSED';

    // Generate leaderboard
    const entries: LeaderboardEntry[] = Array.from(session.players.values())
      .map(player => ({
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalMoney: player.totalMoney,
        rank: 0, // Will be set after sorting
        averageTime: 0 // Calculate if needed
      }))
      .sort((a, b) => {
        // Sort by totalMoney first, then by score as tiebreaker
        if (b.totalMoney !== a.totalMoney) return b.totalMoney - a.totalMoney;
        if (b.score !== a.score) return b.score - a.score;
        return a.nickname.localeCompare(b.nickname);
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    const leaderboard: Leaderboard = {
      sessionId: session.id,
      sessionName: session.name,
      entries,
      totalQuestions: session.questions.length,
      completedAt: Date.now()
    };

    console.log(`🏆 Session ${session.code} closed - Winner: ${entries[0]?.nickname || 'N/A'}`);
    return leaderboard;
  }

  /**
   * Delete session
   */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    this.sessions.delete(sessionId);
    this.sessionsByCodes.delete(session.code);
    console.log(`🗑️  Deleted session ${session.code}`);
    return true;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter(
      s => s.state !== 'CLOSED'
    );
  }

  /**
   * Get all sessions (including closed)
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Update session state
   */
  updateSessionState(sessionId: string, state: SessionState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.state = state;
    return true;
  }

  /**
   * Get current question
   */
  getCurrentQuestion(sessionId: string): Question | null {
    const session = this.sessions.get(sessionId);
    if (!session || session.currentQuestionIndex < 0) return null;

    return session.questions[session.currentQuestionIndex] || null;
  }

  /**
   * Get admin settings for session
   */
  getSettings(sessionId: string): AdminSettings | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return session.settings || null;
  }

  /**
   * Update admin settings for session
   */
  updateSettings(sessionId: string, settings: AdminSettings): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.settings = settings;
    console.log(`⚙️  Updated settings for ${session.code}:`, settings.provider || 'none');
    return true;
  }

  /**
   * Clear admin settings for session
   */
  clearSettings(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    session.settings = undefined;
    console.log(`🧹 Cleared settings for ${session.code}`);
    return true;
  }
}
