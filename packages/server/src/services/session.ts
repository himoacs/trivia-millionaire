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
  AdminSettings,
  Round,
  RoundState
} from '@trivia-millionaire/shared';
import {
  generateSessionId,
  generateSessionCode,
  generatePlayerId,
  generateRoundId,
  generateReconnectToken,
  calculateScore,
  calculateMoneyWithSpeedBonus,
  sanitizeNickname
} from '@trivia-millionaire/shared';
import { getDatabase, DatabaseService } from './database.js';

export class SessionManager {
  private db: DatabaseService;
  // In-memory cache for active sessions (for performance)
  private sessionCache: Map<string, Session> = new Map();
  private sessionCodeCache: Map<string, string> = new Map(); // code -> sessionId

  constructor() {
    this.db = getDatabase();
    this.loadSessionsFromDb();
  }

  /**
   * Load existing sessions from database on startup
   */
  private loadSessionsFromDb(): void {
    const sessions = this.db.getAllSessions();
    for (const session of sessions) {
      this.sessionCache.set(session.id, session);
      this.sessionCodeCache.set(session.code, session.id);
    }
    console.log(`📦 Loaded ${sessions.length} sessions from database`);
  }

  /**
   * Persist session to database
   */
  private persistSession(session: Session): void {
    this.db.saveSession(session);
    // Persist players
    session.players.forEach(player => {
      this.db.savePlayer(session.id, player);
    });
    // Persist questions
    this.db.saveQuestions(session.id, session.questions);
    // Persist rounds
    session.rounds.forEach((round, index) => {
      this.db.saveRound(session.id, round, index);
    });
  }

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
      config: { ...defaultConfig, ...config },
      rounds: [],
      currentRoundIndex: -1
    };

    this.sessionCache.set(sessionId, session);
    this.sessionCodeCache.set(code, sessionId);
    this.db.saveSession(session);

    console.log(`🎮 Created session: ${session.name} (${code})`);
    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): Session | undefined {
    // Try cache first
    let session = this.sessionCache.get(sessionId);
    if (session) return session;

    // Fall back to database
    session = this.db.getSession(sessionId) || undefined;
    if (session) {
      this.sessionCache.set(sessionId, session);
      this.sessionCodeCache.set(session.code, sessionId);
    }
    return session;
  }

  /**
   * Get session by code
   */
  getSessionByCode(code: string): Session | undefined {
    const sessionId = this.sessionCodeCache.get(code);
    if (sessionId) {
      return this.getSession(sessionId);
    }

    // Fall back to database
    const session = this.db.getSessionByCode(code) || undefined;
    if (session) {
      this.sessionCache.set(session.id, session);
      this.sessionCodeCache.set(session.code, session.id);
    }
    return session;
  }

  /**
   * Add player to session with reconnect token
   */
  addPlayer(
    sessionId: string,
    nickname: string,
    avatar: PlayerAvatar
  ): Player | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    // Allow joining in LOBBY, ACTIVE, or PAUSED state, but not CLOSED
    if (session.state === 'CLOSED') {
      console.error('Cannot join session - game has ended');
      return null;
    }

    if (session.players.size >= session.config.maxPlayers) {
      console.error('Session is full');
      return null;
    }

    const playerId = generatePlayerId();
    const reconnectToken = generateReconnectToken();
    
    const player: Player = {
      id: playerId,
      nickname: sanitizeNickname(nickname),
      avatar,
      score: 0,
      correctAnswers: 0,
      totalAnswers: 0,
      totalMoney: 0,
      connectedAt: Date.now(),
      reconnectToken,
      roundScores: {}
    };

    session.players.set(playerId, player);
    this.db.savePlayer(sessionId, player);
    
    const lateJoin = session.state === 'ACTIVE' || session.state === 'PAUSED' ? ' (late join)' : '';
    console.log(`👤 Player joined ${session.code}: ${player.nickname}${lateJoin}`);
    return player;
  }

  /**
   * Reconnect player using token
   */
  reconnectPlayer(token: string, sessionId: string): Player | null {
    const playerData = this.db.getPlayerByToken(token);
    if (!playerData || playerData.sessionId !== sessionId) {
      console.error('Invalid reconnect token or session mismatch');
      return null;
    }

    const session = this.getSession(sessionId);
    if (!session) return null;

    // Update the cached player data
    const player = session.players.get(playerData.id);
    if (player) {
      console.log(`🔄 Player reconnected: ${player.nickname}`);
      return player;
    }

    // If not in cache, add from database
    session.players.set(playerData.id, playerData);
    console.log(`🔄 Player reconnected from DB: ${playerData.nickname}`);
    return playerData;
  }

  /**
   * Get player by reconnect token
   */
  getPlayerByToken(token: string): (Player & { sessionId: string }) | null {
    return this.db.getPlayerByToken(token);
  }

  /**
   * Remove player from session
   */
  removePlayer(sessionId: string, playerId: string): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    const removed = session.players.delete(playerId);
    if (removed) {
      this.db.deletePlayer(playerId);
      console.log(`👋 Player left ${session.code}: ${playerId}`);
    }
    return removed;
  }

  /**
   * Add questions to session (prevents duplicates by ID)
   */
  addQuestions(sessionId: string, questions: Question[]): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    // Filter out questions that already exist
    const existingIds = new Set(session.questions.map(q => q.id));
    const newQuestions = questions.filter(q => !existingIds.has(q.id));
    
    if (newQuestions.length > 0) {
      session.questions.push(...newQuestions);
      this.db.saveQuestions(sessionId, session.questions);
      console.log(`📝 Added ${newQuestions.length} questions to ${session.code}`);
    }
    return true;
  }

  /**
   * Update a question
   */
  updateQuestion(sessionId: string, questionId: string, updates: Partial<Question>): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    const questionIndex = session.questions.findIndex(q => q.id === questionId);
    if (questionIndex === -1) return false;

    session.questions[questionIndex] = { ...session.questions[questionIndex], ...updates };
    this.db.saveQuestions(sessionId, session.questions);
    return true;
  }

  /**
   * Delete a question
   */
  deleteQuestion(sessionId: string, questionId: string): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    const initialLength = session.questions.length;
    session.questions = session.questions.filter(q => q.id !== questionId);
    
    if (session.questions.length < initialLength) {
      this.db.deleteQuestion(questionId);
      return true;
    }
    return false;
  }

  // ===================
  // ROUND MANAGEMENT
  // ===================

  /**
   * Create a new round in the session
   */
  createRound(sessionId: string, name: string, questionIds?: string[]): Round | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    const round: Round = {
      id: generateRoundId(),
      name,
      questionIds: questionIds || [],
      state: 'PENDING'
    };

    session.rounds.push(round);
    this.db.saveRound(sessionId, round, session.rounds.length - 1);

    // Assign questions to this round
    if (questionIds && questionIds.length > 0) {
      questionIds.forEach(qId => {
        const question = session.questions.find(q => q.id === qId);
        if (question) {
          question.roundId = round.id;
          this.db.updateQuestionRound(qId, round.id);
        }
      });
    }

    console.log(`🎯 Created round "${name}" with ${round.questionIds.length} questions`);
    return round;
  }

  /**
   * Update a round
   */
  updateRound(sessionId: string, roundId: string, updates: Partial<Omit<Round, 'id'>>): Round | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    const roundIndex = session.rounds.findIndex(r => r.id === roundId);
    if (roundIndex === -1) return null;

    const round = session.rounds[roundIndex];
    
    // Handle question reassignment if questionIds changed
    if (updates.questionIds) {
      // Remove old assignments
      round.questionIds.forEach(qId => {
        const q = session.questions.find(q => q.id === qId);
        if (q) {
          q.roundId = undefined;
          this.db.updateQuestionRound(qId, null);
        }
      });

      // Add new assignments
      updates.questionIds.forEach(qId => {
        const q = session.questions.find(q => q.id === qId);
        if (q) {
          q.roundId = roundId;
          this.db.updateQuestionRound(qId, roundId);
        }
      });
    }

    Object.assign(round, updates);
    this.db.saveRound(sessionId, round, roundIndex);

    return round;
  }

  /**
   * Delete a round
   */
  deleteRound(sessionId: string, roundId: string): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    const roundIndex = session.rounds.findIndex(r => r.id === roundId);
    if (roundIndex === -1) return false;

    // Unassign questions from this round
    session.questions.forEach(q => {
      if (q.roundId === roundId) {
        q.roundId = undefined;
      }
    });

    session.rounds.splice(roundIndex, 1);
    this.db.deleteRound(roundId);

    console.log(`🗑️ Deleted round ${roundId}`);
    return true;
  }

  /**
   * Get rounds for a session
   */
  getRounds(sessionId: string): Round[] {
    const session = this.sessionCache.get(sessionId);
    return session?.rounds || [];
  }

  /**
   * Get current round
   */
  getCurrentRound(sessionId: string): Round | null {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.currentRoundIndex < 0) return null;
    return session.rounds[session.currentRoundIndex] || null;
  }

  /**
   * Start a specific round
   */
  startRound(sessionId: string, roundId: string): Round | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    const roundIndex = session.rounds.findIndex(r => r.id === roundId);
    if (roundIndex === -1) return null;

    const round = session.rounds[roundIndex];
    round.state = 'ACTIVE';
    round.startedAt = Date.now();
    
    session.currentRoundIndex = roundIndex;
    session.state = 'ACTIVE';

    // Find first question of this round in the questions array
    if (round.questionIds.length > 0) {
      const firstQuestionId = round.questionIds[0];
      const questionIndex = session.questions.findIndex(q => q.id === firstQuestionId);
      if (questionIndex >= 0) {
        // Set currentQuestionIndex to one before so releaseQuestion will get the first one
        session.currentQuestionIndex = questionIndex - 1;
      }
    }

    this.db.updateRoundState(roundId, 'ACTIVE', round.startedAt);
    this.db.updateSessionRoundIndex(sessionId, roundIndex);
    this.db.updateSessionState(sessionId, 'ACTIVE');

    console.log(`▶️ Started round "${round.name}"`);
    return round;
  }

  /**
   * End the current round (triggers break/pause)
   */
  endCurrentRound(sessionId: string): { round: Round; leaderboard: LeaderboardEntry[] } | null {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.currentRoundIndex < 0) return null;

    const round = session.rounds[session.currentRoundIndex];
    if (!round) return null;

    round.state = 'COMPLETED';
    round.completedAt = Date.now();
    session.state = 'PAUSED'; // Pause for break

    this.db.updateRoundState(round.id, 'COMPLETED', round.completedAt);
    this.db.updateSessionState(sessionId, 'PAUSED');

    // Generate current leaderboard
    const leaderboard = this.generateLeaderboard(session);

    console.log(`⏸️ Ended round "${round.name}" - session paused for break`);
    return { round, leaderboard };
  }

  /**
   * Start the next round (resume from break)
   */
  startNextRound(sessionId: string): Round | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    const nextRoundIndex = session.currentRoundIndex + 1;
    if (nextRoundIndex >= session.rounds.length) {
      console.log('No more rounds');
      return null;
    }

    const nextRound = session.rounds[nextRoundIndex];
    return this.startRound(sessionId, nextRound.id);
  }

  /**
   * Jump to a specific question within the current round
   */
  jumpToQuestion(sessionId: string, questionIndexInRound: number): Question | null {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.state !== 'ACTIVE') return null;

    const currentRound = this.getCurrentRound(sessionId);
    if (!currentRound) return null;

    if (questionIndexInRound < 0 || questionIndexInRound >= currentRound.questionIds.length) {
      console.log('Invalid question index for round');
      return null;
    }

    const questionId = currentRound.questionIds[questionIndexInRound];
    const questionIndex = session.questions.findIndex(q => q.id === questionId);
    
    if (questionIndex === -1) {
      console.log('Question not found');
      return null;
    }

    session.currentQuestionIndex = questionIndex;
    session.currentQuestionStartTime = Date.now();
    
    this.db.updateSessionQuestionIndex(sessionId, session.currentQuestionIndex, session.currentQuestionStartTime);
    
    console.log(`⏭️ Jumped to question ${questionIndexInRound + 1} in round "${currentRound.name}"`);
    return session.questions[questionIndex];
  }

  /**
   * Get the current question index within the active round
   */
  getCurrentQuestionIndexInRound(sessionId: string): number {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.currentQuestionIndex < 0) return -1;

    const currentRound = this.getCurrentRound(sessionId);
    if (!currentRound) return session.currentQuestionIndex;

    const currentQuestion = session.questions[session.currentQuestionIndex];
    if (!currentQuestion) return -1;

    return currentRound.questionIds.indexOf(currentQuestion.id);
  }

  /**
   * Skip (abort) the current round and jump to another round
   * If targetRoundIndex is -1, just abort the current round and pause
   */
  skipToRound(sessionId: string, targetRoundIndex: number): Round | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    // Mark current round as completed/skipped
    if (session.currentRoundIndex >= 0) {
      const currentRound = session.rounds[session.currentRoundIndex];
      if (currentRound && currentRound.state === 'ACTIVE') {
        currentRound.state = 'COMPLETED';
        currentRound.completedAt = Date.now();
        this.db.updateRoundState(currentRound.id, 'COMPLETED', currentRound.completedAt);
        console.log(`⏭️ Skipped round "${currentRound.name}"`);
      }
    }

    // If target is -1 or invalid, just pause the session
    if (targetRoundIndex < 0 || targetRoundIndex >= session.rounds.length) {
      session.state = 'PAUSED';
      this.db.updateSessionState(sessionId, 'PAUSED');
      return null;
    }

    // Jump to target round
    const targetRound = session.rounds[targetRoundIndex];
    return this.startRound(sessionId, targetRound.id);
  }

  /**
   * Auto-distribute questions into rounds
   */
  autoDistributeQuestions(sessionId: string, questionsPerRound: number = 5): Round[] {
    const session = this.sessionCache.get(sessionId);
    if (!session) return [];

    // Clear existing rounds
    session.rounds.forEach(r => this.deleteRound(sessionId, r.id));
    session.rounds = [];

    // Get unassigned questions
    const unassignedQuestions = session.questions.filter(q => !q.roundId);
    const numRounds = Math.ceil(unassignedQuestions.length / questionsPerRound);

    const rounds: Round[] = [];
    for (let i = 0; i < numRounds; i++) {
      const start = i * questionsPerRound;
      const end = Math.min(start + questionsPerRound, unassignedQuestions.length);
      const questionIds = unassignedQuestions.slice(start, end).map(q => q.id);
      
      const round = this.createRound(sessionId, `Round ${i + 1}`, questionIds);
      if (round) rounds.push(round);
    }

    console.log(`📊 Auto-distributed ${unassignedQuestions.length} questions into ${rounds.length} rounds`);
    return rounds;
  }

  // ===================
  // GAME FLOW
  // ===================

  /**
   * Start session (backwards compatible - starts first round if rounds exist)
   */
  startSession(sessionId: string): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    if (session.questions.length === 0) {
      console.error('Cannot start session - no questions');
      return false;
    }

    // If rounds exist but have no questions assigned, auto-distribute
    if (session.rounds.length > 0) {
      const totalRoundQuestions = session.rounds.reduce((sum, r) => sum + r.questionIds.length, 0);
      if (totalRoundQuestions === 0 && session.questions.length > 0) {
        console.log('📊 Auto-distributing questions to rounds before starting...');
        this.distributeQuestionsToExistingRounds(sessionId);
      }
      
      const firstRound = session.rounds[0];
      this.startRound(sessionId, firstRound.id);
    } else {
      // No rounds - flat question list (legacy behavior)
      session.state = 'ACTIVE';
      this.db.updateSessionState(sessionId, 'ACTIVE');
    }

    console.log(`▶️ Started session ${session.code}`);
    return true;
  }

  /**
   * Distribute unassigned questions to existing rounds evenly
   */
  private distributeQuestionsToExistingRounds(sessionId: string): void {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.rounds.length === 0) return;

    const unassignedQuestions = session.questions.filter(q => !q.roundId);
    if (unassignedQuestions.length === 0) return;

    const questionsPerRound = Math.ceil(unassignedQuestions.length / session.rounds.length);

    let questionIndex = 0;
    for (const round of session.rounds) {
      const questionsForRound = unassignedQuestions.slice(
        questionIndex,
        questionIndex + questionsPerRound
      );
      
      for (const question of questionsForRound) {
        question.roundId = round.id;
        round.questionIds.push(question.id);
        this.db.updateQuestionRound(question.id, round.id);
      }
      
      // Update round in database
      const roundIndex = session.rounds.indexOf(round);
      this.db.saveRound(sessionId, round, roundIndex);
      
      questionIndex += questionsPerRound;
      console.log(`  📌 Assigned ${questionsForRound.length} questions to "${round.name}"`);
    }
  }

  /**
   * Release next question (round-aware)
   */
  releaseQuestion(sessionId: string): Question | null {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.state !== 'ACTIVE') return null;

    const currentRound = this.getCurrentRound(sessionId);
    
    // If using rounds, find next question in current or subsequent rounds
    if (currentRound) {
      // Find the next question that belongs to any round starting from current
      let foundQuestion: Question | null = null;
      let questionIndex = session.currentQuestionIndex + 1;
      
      // Try to find next question in current round first
      while (questionIndex < session.questions.length) {
        const candidate = session.questions[questionIndex];
        if (currentRound.questionIds.includes(candidate.id)) {
          foundQuestion = candidate;
          session.currentQuestionIndex = questionIndex;
          break;
        }
        questionIndex++;
      }
      
      // If no more questions in current round, check if there's a next round
      if (!foundQuestion) {
        const nextRoundIndex = session.currentRoundIndex + 1;
        if (nextRoundIndex < session.rounds.length) {
          const nextRound = session.rounds[nextRoundIndex];
          console.log(`🏁 Round "${currentRound.name}" completed. Need to start next round: "${nextRound.name}"`);
          // Don't auto-advance, return null so admin can start next round manually
          return null;
        } else {
          console.log('No more questions - all rounds completed');
          return null;
        }
      }
      
      const question = foundQuestion;
      session.currentQuestionStartTime = Date.now();
      
      this.db.updateSessionQuestionIndex(sessionId, session.currentQuestionIndex, session.currentQuestionStartTime);
      
      console.log(`❓ Released question ${session.currentQuestionIndex + 1} (Round: ${currentRound.name})`);
      return question;
    } else {
      // Legacy mode - check total questions
      session.currentQuestionIndex++;
      if (session.currentQuestionIndex >= session.questions.length) {
        session.currentQuestionIndex--; // Revert
        console.log('No more questions');
        return null;
      }
      
      const question = session.questions[session.currentQuestionIndex];
      session.currentQuestionStartTime = Date.now();
      
      this.db.updateSessionQuestionIndex(sessionId, session.currentQuestionIndex, session.currentQuestionStartTime);
      
      console.log(`❓ Released question ${session.currentQuestionIndex + 1} of ${session.questions.length}`);
      return question;
    }
  }

  /**
   * Process answer and update score (round-aware)
   */
  processAnswer(sessionId: string, answer: Answer): ScoreUpdate | null {
    const session = this.sessionCache.get(sessionId);
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

    // Track round-specific scores
    const currentRound = this.getCurrentRound(sessionId);
    if (currentRound) {
      if (!player.roundScores) player.roundScores = {};
      player.roundScores[currentRound.id] = (player.roundScores[currentRound.id] || 0) + moneyEarned;
      this.db.addToPlayerRoundScore(player.id, currentRound.id, moneyEarned, correct);
    }

    // Persist player updates
    this.db.savePlayer(sessionId, player);

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
   * Generate leaderboard from session
   */
  private generateLeaderboard(session: Session): LeaderboardEntry[] {
    return Array.from(session.players.values())
      .map(player => ({
        playerId: player.id,
        nickname: player.nickname,
        avatar: player.avatar,
        score: player.score,
        correctAnswers: player.correctAnswers,
        totalMoney: player.totalMoney,
        rank: 0,
        averageTime: 0
      }))
      .sort((a, b) => {
        if (b.totalMoney !== a.totalMoney) return b.totalMoney - a.totalMoney;
        if (b.score !== a.score) return b.score - a.score;
        return a.nickname.localeCompare(b.nickname);
      })
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));
  }

  /**
   * Get current leaderboard for a session (public method)
   */
  getLeaderboard(sessionId: string): LeaderboardEntry[] | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;
    return this.generateLeaderboard(session);
  }

  /**
   * Close session and generate leaderboard
   */
  closeSession(sessionId: string): Leaderboard | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    session.state = 'CLOSED';
    this.db.updateSessionState(sessionId, 'CLOSED');

    const entries = this.generateLeaderboard(session);

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
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    this.sessionCache.delete(sessionId);
    this.sessionCodeCache.delete(session.code);
    this.db.deleteSession(sessionId);
    console.log(`🗑️ Deleted session ${session.code}`);
    return true;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessionCache.values()).filter(
      s => s.state !== 'CLOSED'
    );
  }

  /**
   * Get all sessions (including closed)
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessionCache.values());
  }

  /**
   * Update session state
   */
  updateSessionState(sessionId: string, state: SessionState): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    session.state = state;
    this.db.updateSessionState(sessionId, state);
    return true;
  }

  /**
   * Get current question
   */
  getCurrentQuestion(sessionId: string): Question | null {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.currentQuestionIndex < 0) return null;

    return session.questions[session.currentQuestionIndex] || null;
  }

  /**
   * Get admin settings for session
   */
  getSettings(sessionId: string): AdminSettings | null {
    const session = this.sessionCache.get(sessionId);
    if (!session) return null;

    return session.settings || null;
  }

  /**
   * Update admin settings for session
   */
  updateSettings(sessionId: string, settings: AdminSettings): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    session.settings = settings;
    this.db.updateSessionSettings(sessionId, settings);
    console.log(`⚙️ Updated settings for ${session.code}:`, settings.provider || 'none');
    return true;
  }

  /**
   * Clear admin settings for session
   */
  clearSettings(sessionId: string): boolean {
    const session = this.sessionCache.get(sessionId);
    if (!session) return false;

    session.settings = undefined;
    this.db.updateSessionSettings(sessionId, null);
    console.log(`🧹 Cleared settings for ${session.code}`);
    return true;
  }

  /**
   * Get round info for question message
   */
  getRoundInfoForQuestion(sessionId: string): QuestionMessage['roundInfo'] | undefined {
    const session = this.sessionCache.get(sessionId);
    if (!session || session.currentRoundIndex < 0) return undefined;

    const round = session.rounds[session.currentRoundIndex];
    if (!round) return undefined;

    const currentQuestion = session.questions[session.currentQuestionIndex];
    const questionPositionInRound = round.questionIds.indexOf(currentQuestion?.id || '');

    return {
      roundId: round.id,
      roundName: round.name,
      roundNumber: session.currentRoundIndex + 1,
      totalRounds: session.rounds.length,
      questionInRound: questionPositionInRound + 1,
      totalQuestionsInRound: round.questionIds.length
    };
  }
}

// Import QuestionMessage type for getRoundInfoForQuestion return type
import type { QuestionMessage } from '@trivia-millionaire/shared';
