// Who Wants to Be a Millionaire theme colors
export const THEME_COLORS = {
  // Primary navy (show's dominant background color)
  navy: '#0D1B2A',
  navyDark: '#050D18',
  navyLight: '#1B3A5A',
  
  // Accent blue (answer boxes, UI elements)
  blue: '#0052A3',
  blueDark: '#003D7A',
  blueLight: '#1A6BC0',
  
  // Gold/Orange (highlights, money, CTAs)
  gold: '#F7941D',
  goldDark: '#D67A0D',
  goldLight: '#FFB81C',
  orange: '#FF6B35',
  
  // Accent purple (secondary lighting effects)
  accentPurple: '#2D1B69',
  accentPurpleLight: '#3D2B79',
  
  // Teal (money ladder highlight - authentic WWTBAM)
  teal: '#00B4D8',
  tealDark: '#0096B4',
  tealLight: '#48CAE4',
  
  // Dark backgrounds
  dark: '#0A0A0A',
  darkLight: '#1A1A2E',
  
  // Supporting colors
  white: '#FFFFFF',
  black: '#000000',
} as const;

// Semantic colors for UI feedback
export const SEMANTIC_COLORS = {
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#3B82F6',
} as const;

// Answer choice colors
export const ANSWER_COLORS = {
  choice1: '#E21B3C', // Red
  choice2: '#1368CE', // Blue
  choice3: '#D89E00', // Gold/Yellow
  choice4: '#26890C', // Green
} as const;

// Legacy alias for backward compatibility
export const COLORS = {
  ...THEME_COLORS,
  ...SEMANTIC_COLORS,
  primary: THEME_COLORS.teal,
  primaryDark: THEME_COLORS.tealDark,
  primaryLight: THEME_COLORS.tealLight,
  gray50: '#F9FAFB',
  gray100: '#F3F4F6',
  gray200: '#E5E7EB',
  gray300: '#D1D5DB',
  gray500: '#6B7280',
  gray700: '#374151',
  gray900: '#111827',
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
