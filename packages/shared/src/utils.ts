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

// ============================================================================
// Topic Tree Utilities for Sunburst Visualization
// ============================================================================

import type { TopicTreeNode, SunburstDisplayOptions } from './types';

/**
 * Creates a new empty topic tree root node
 */
export function createTopicTreeRoot(): TopicTreeNode {
  return {
    name: 'root',
    fullPath: '',
    children: new Map(),
    messageCount: 0,
    directMessageCount: 0,
    byteCount: 0,
    uniqueTopics: 0,
    lastArrival: 0,
    depth: 0,
  };
}

/**
 * Adds a message to the topic tree, creating intermediate nodes as needed
 * @param root - The root node of the topic tree
 * @param topic - Full topic string (e.g., "trivia/session/abc/player/123/joined")
 * @param payloadBytes - Size of the message payload in bytes
 * @param timestamp - Message arrival timestamp
 * @returns Updated root node (mutates in place but returns for convenience)
 */
export function addMessageToTopicTree(
  root: TopicTreeNode,
  topic: string,
  payloadBytes: number,
  timestamp: number
): TopicTreeNode {
  const levels = topic.split('/').filter(l => l.length > 0);
  
  let currentNode = root;
  let currentPath = '';
  
  // Update root metrics
  root.messageCount++;
  root.byteCount += payloadBytes;
  root.lastArrival = Math.max(root.lastArrival, timestamp);
  
  // Traverse/create path through tree
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    currentPath = currentPath ? `${currentPath}/${level}` : level;
    
    let child = currentNode.children.get(level);
    
    if (!child) {
      // Create new node
      child = {
        name: level,
        fullPath: currentPath,
        children: new Map(),
        messageCount: 0,
        directMessageCount: 0,
        byteCount: 0,
        uniqueTopics: 0,
        lastArrival: 0,
        depth: i + 1,
      };
      currentNode.children.set(level, child);
    }
    
    // Update metrics for this node
    child.messageCount++;
    child.byteCount += payloadBytes;
    child.lastArrival = Math.max(child.lastArrival, timestamp);
    
    // If this is the leaf (last level), it's a direct message to this exact topic
    if (i === levels.length - 1) {
      child.directMessageCount++;
    }
    
    currentNode = child;
  }
  
  return root;
}

/**
 * Recalculates uniqueTopics count for all nodes in the tree
 * Should be called after batch updates for efficiency
 */
export function recalculateUniqueTopics(node: TopicTreeNode): number {
  if (node.children.size === 0) {
    // Leaf node - counts as 1 unique topic if it has messages
    node.uniqueTopics = node.directMessageCount > 0 ? 1 : 0;
    return node.uniqueTopics;
  }
  
  let total = 0;
  // Count unique topics from children
  node.children.forEach(child => {
    total += recalculateUniqueTopics(child);
  });
  
  // Add 1 if this node itself received direct messages (inner message)
  if (node.directMessageCount > 0) {
    total++;
  }
  
  node.uniqueTopics = total;
  return total;
}

/**
 * Converts TopicTreeNode to D3-compatible hierarchy format
 * Applies sorting and limits based on display options
 */
export function topicTreeToD3Hierarchy(
  node: TopicTreeNode,
  options: SunburstDisplayOptions,
  currentDepth: number = 0
): any {
  const children = Array.from(node.children.values());
  
  // Sort children based on options
  const sortedChildren = sortTopicNodes(children, options);
  
  // Limit children and create *OTHERS* rollup if needed
  let processedChildren: any[] = [];
  let othersNode: any | null = null;
  
  if (sortedChildren.length > options.maxElementsPerLevel) {
    const visibleChildren = sortedChildren.slice(0, options.maxElementsPerLevel);
    const hiddenChildren = sortedChildren.slice(options.maxElementsPerLevel);
    
    // Create *OTHERS* rollup
    othersNode = {
      name: '*OTHERS*',
      fullPath: `${node.fullPath}/*OTHERS*`,
      messageCount: hiddenChildren.reduce((sum, c) => sum + c.messageCount, 0),
      byteCount: hiddenChildren.reduce((sum, c) => sum + c.byteCount, 0),
      uniqueTopics: hiddenChildren.reduce((sum, c) => sum + c.uniqueTopics, 0),
      lastArrival: Math.max(...hiddenChildren.map(c => c.lastArrival)),
      depth: currentDepth + 1,
      isOthers: true,
      hiddenCount: hiddenChildren.length,
    };
    
    processedChildren = visibleChildren.map(child => 
      topicTreeToD3Hierarchy(child, options, currentDepth + 1)
    );
    processedChildren.push(othersNode);
  } else {
    processedChildren = sortedChildren.map(child =>
      topicTreeToD3Hierarchy(child, options, currentDepth + 1)
    );
  }
  
  // Calculate value for D3 based on viewBy option
  let value: number;
  switch (options.viewBy) {
    case 'messages':
      value = node.messageCount;
      break;
    case 'bytes':
      value = node.byteCount;
      break;
    case 'topics':
      value = node.uniqueTopics;
      break;
    case 'balanced':
    default:
      value = 1; // Equal size for all
      break;
  }
  
  return {
    name: node.name,
    fullPath: node.fullPath,
    messageCount: node.messageCount,
    directMessageCount: node.directMessageCount,
    byteCount: node.byteCount,
    uniqueTopics: node.uniqueTopics,
    lastArrival: node.lastArrival,
    depth: currentDepth,
    value: processedChildren.length === 0 ? value : undefined,
    children: processedChildren.length > 0 ? processedChildren : undefined,
    hasInnerMessages: node.directMessageCount > 0 && node.children.size > 0,
  };
}

/**
 * Sorts topic nodes based on display options
 */
function sortTopicNodes(
  nodes: TopicTreeNode[],
  options: SunburstDisplayOptions
): TopicTreeNode[] {
  const sorted = [...nodes];
  const dir = options.sortDirection === 'asc' ? 1 : -1;
  
  sorted.sort((a, b) => {
    let comparison = 0;
    switch (options.sortBy) {
      case 'messages':
        comparison = a.messageCount - b.messageCount;
        break;
      case 'bytes':
        comparison = a.byteCount - b.byteCount;
        break;
      case 'topics':
        comparison = a.uniqueTopics - b.uniqueTopics;
        break;
      case 'busyTopics':
        // Ratio of messages to unique topics (higher = busier per topic)
        const busyA = a.uniqueTopics > 0 ? a.messageCount / a.uniqueTopics : 0;
        const busyB = b.uniqueTopics > 0 ? b.messageCount / b.uniqueTopics : 0;
        comparison = busyA - busyB;
        break;
      case 'lastArrival':
        comparison = a.lastArrival - b.lastArrival;
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'depth':
        comparison = getMaxDepth(a) - getMaxDepth(b);
        break;
      default:
        comparison = a.messageCount - b.messageCount;
    }
    return comparison * dir;
  });
  
  return sorted;
}

/**
 * Gets the maximum depth of any leaf in the subtree
 */
function getMaxDepth(node: TopicTreeNode): number {
  if (node.children.size === 0) {
    return node.depth;
  }
  let maxChildDepth = node.depth;
  node.children.forEach(child => {
    maxChildDepth = Math.max(maxChildDepth, getMaxDepth(child));
  });
  return maxChildDepth;
}

/**
 * Clears all data from the topic tree, keeping structure
 */
export function clearTopicTree(root: TopicTreeNode): TopicTreeNode {
  return createTopicTreeRoot();
}

/**
 * Gets color for a sunburst arc based on depth
 * Uses HSL color space for smooth gradients
 */
export function getArcColor(depth: number, isRollup: boolean = false): string {
  const { arcHueStart, arcHueRange, arcSaturation, arcLightness, arcLightnessRollup } = 
    // Import from types at runtime to avoid circular deps
    { arcHueStart: 200, arcHueRange: 160, arcSaturation: 65, arcLightness: 50, arcLightnessRollup: 35 };
  
  // Cycle through hue range based on depth
  const hue = (arcHueStart + (depth * 30) % arcHueRange) % 360;
  const lightness = isRollup ? arcLightnessRollup : arcLightness;
  
  return `hsl(${hue}, ${arcSaturation}%, ${lightness}%)`;
}

/**
 * Formats bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
