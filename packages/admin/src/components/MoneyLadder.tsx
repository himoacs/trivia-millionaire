import { motion } from 'framer-motion';

interface MoneyLadderProps {
  currentQuestion: number;
  totalQuestions: number;
  questionResults?: Record<number, boolean>;
  className?: string;
}

export const MONEY_LADDER = [
  { level: 1, amount: 100 },
  { level: 2, amount: 200 },
  { level: 3, amount: 300 },
  { level: 4, amount: 500 },
  { level: 5, amount: 1000, milestone: true },
  { level: 6, amount: 2000 },
  { level: 7, amount: 4000 },
  { level: 8, amount: 8000 },
  { level: 9, amount: 16000 },
  { level: 10, amount: 32000, milestone: true },
  { level: 11, amount: 64000 },
  { level: 12, amount: 125000 },
  { level: 13, amount: 250000 },
  { level: 14, amount: 500000 },
  { level: 15, amount: 1000000, milestone: true },
];

export function formatMoney(amount: number): string {
  if (amount >= 1000000) {
    return `$${(amount / 1000000).toFixed(0)}M`;
  } else if (amount >= 1000) {
    return `$${(amount / 1000).toFixed(0)}K`;
  }
  return `$${amount}`;
}

export function MoneyLadder({ currentQuestion, totalQuestions, questionResults = {}, className = '' }: MoneyLadderProps) {
  // Scale the money ladder to match the total questions
  const relevantLadder = MONEY_LADDER.slice(0, totalQuestions).reverse();
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {relevantLadder.map((level, index) => {
        const actualLevel = totalQuestions - index;
        const isCurrent = actualLevel === currentQuestion;
        const isPassed = actualLevel < currentQuestion;
        const isMilestone = level.milestone;
        const wasCorrect = questionResults[actualLevel] === true;
        const wasIncorrect = questionResults[actualLevel] === false;
        
        // Determine styling based on question result
        const getBackgroundClass = () => {
          if (isCurrent) {
            return 'bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-[0_0_25px_rgba(255,149,0,0.7)]';
          }
          if (wasCorrect) {
            return 'bg-gradient-to-r from-amber-600 to-yellow-500 text-white border border-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.5)]';
          }
          if (wasIncorrect) {
            return 'bg-purple-950/80 text-purple-400/60 border border-purple-700/40 opacity-60';
          }
          if (isPassed) {
            return 'bg-gray-800/40 text-gray-600 border border-gray-700/50';
          }
          if (isMilestone) {
            return 'bg-gradient-to-r from-blue-900 to-blue-800 text-amber-400 border-2 border-amber-500/60';
          }
          return 'bg-purple-950/60 text-gray-400 border border-amber-500/20';
        };
        
        return (
          <motion.div
            key={level.level}
            initial={{ opacity: 0, x: -20 }}
            animate={{ 
              opacity: isCurrent ? [1, 0.6, 1] : 1, 
              x: 0,
              scale: isCurrent ? 1.05 : 1
            }}
            transition={isCurrent ? {
              opacity: { duration: 1.2, repeat: Infinity, ease: "easeInOut" },
              x: { delay: index * 0.05, duration: 0.4 },
              scale: { delay: index * 0.05, duration: 0.4 }
            } : {
              delay: index * 0.05, 
              duration: 0.4
            }}
            className={`
              relative px-4 py-3 font-black text-sm transition-all duration-400
              ${getBackgroundClass()}
            `}
            style={{
              clipPath: isCurrent 
                ? 'polygon(0% 0%, 95% 0%, 100% 50%, 95% 100%, 0% 100%)'
                : 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
              textDecoration: wasIncorrect ? 'line-through' : 'none'
            }}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${
                isCurrent ? 'text-white' : 
                wasCorrect ? 'text-amber-100' : 
                wasIncorrect ? 'text-purple-500/60' :
                isPassed ? 'text-gray-600' : 'text-gray-500'
              }`}>
                {actualLevel}
              </span>
              <span className={`${isCurrent ? 'text-xl' : 'text-base'} tracking-wide`}
                    style={{ textShadow: isCurrent ? '0 0 10px rgba(255,149,0,0.8)' : wasCorrect ? '0 0 8px rgba(245,158,11,0.6)' : 'none' }}>
                {formatMoney(level.amount)}
              </span>
              {wasCorrect && (
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-amber-300 text-xs font-bold">
                  ✓
                </span>
              )}
              {wasIncorrect && (
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-purple-500/60 text-xs">
                  ✗
                </span>
              )}
              {isMilestone && !isPassed && !wasCorrect && !wasIncorrect && (
                <span className="absolute -left-2 top-1/2 -translate-y-1/2 text-xs">
                  🏆
                </span>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
