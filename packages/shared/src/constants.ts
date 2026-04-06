// Solace brand colors
export const COLORS = {
  // Primary Solace green
  primary: '#00C895',
  primaryDark: '#00A87D',
  primaryLight: '#33D4AC',
  
  // Navy blue
  navy: '#1A3A52',
  navyDark: '#0F2433',
  navyLight: '#2A4A62',
  
  // Supporting colors
  white: '#FFFFFF',
  black: '#000000',
  
  // Semantic colors
  success: '#00C895',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
  
  // UI grays
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray500: '#6B7280',
  gray700: '#374151',
  gray900: '#111827',
} as const;

// Answer choice colors (Kahoot-style)
export const ANSWER_COLORS = {
  choice1: '#E21B3C', // Red
  choice2: '#1368CE', // Blue
  choice3: '#D89E00', // Gold/Yellow
  choice4: '#26890C', // Green
} as const;

// Animation durations
export const ANIMATION = {
  fast: 150,
  normal: 300,
  slow: 500,
  countdown: 1000,
} as const;

// Sound effect types
export const SOUNDS = {
  join: 'join',
  questionStart: 'question-start',
  tick: 'tick',
  correctAnswer: 'correct',
  wrongAnswer: 'wrong',
  leaderboard: 'leaderboard',
  countdown: 'countdown',
} as const;

// Z-index layers
export const Z_INDEX = {
  background: 0,
  content: 10,
  modal: 50,
  toast: 100,
  debug: 1000,
} as const;
