import { motion } from 'framer-motion';

interface MoneyLadderProps {
  currentQuestion: number;
  totalQuestions: number;
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

export function MoneyLadder({ currentQuestion, totalQuestions, className = '' }: MoneyLadderProps) {
  // Scale the money ladder to match the total questions
  const relevantLadder = MONEY_LADDER.slice(0, totalQuestions).reverse();
  
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {relevantLadder.map((level, index) => {
        const actualLevel = totalQuestions - index;
        const isCurrent = actualLevel === currentQuestion;
        const isPassed = actualLevel < currentQuestion;
        const isMilestone = level.milestone;
        
        return (
          <motion.div
            key={level.level}
            initial={{ opacity: 0, x: -20 }}
            animate={{ 
              opacity: 1, 
              x: 0,
              scale: isCurrent ? 1.05 : 1
            }}
            transition={{ delay: index * 0.05, duration: 0.4 }}
            className={`
              relative px-4 py-3 font-black text-sm transition-all duration-400
              ${isCurrent 
                ? 'bg-gradient-to-r from-orange-500 via-amber-500 to-orange-600 text-white shadow-[0_0_25px_rgba(255,149,0,0.7)]' 
                : isPassed
                  ? 'bg-gray-800/40 text-gray-600 border border-gray-700/50'
                  : isMilestone
                    ? 'bg-gradient-to-r from-blue-900 to-blue-800 text-amber-400 border-2 border-amber-500/60'
                    : 'bg-purple-950/60 text-gray-400 border border-amber-500/20'
              }
            `}
            style={{
              clipPath: isCurrent 
                ? 'polygon(0% 0%, 95% 0%, 100% 50%, 95% 100%, 0% 100%)'
                : 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)'
            }}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-bold ${isCurrent ? 'text-white' : isPassed ? 'text-gray-600' : 'text-gray-500'}`}>
                {actualLevel}
              </span>
              <span className={`${isCurrent ? 'text-xl' : 'text-base'} tracking-wide`}
                    style={{ textShadow: isCurrent ? '0 0 10px rgba(255,149,0,0.8)' : 'none' }}>
                {formatMoney(level.amount)}
              </span>
              {isMilestone && !isPassed && (
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
