import { motion } from 'framer-motion';

interface AnswerStats {
  choiceIndex: number;
  count: number;
  percentage: number;
}

interface AnswerDistributionChartProps {
  questionText: string;
  choices: string[];
  correctIndex: number;
  stats: AnswerStats[];
  totalResponses: number;
  showCorrectAnswer?: boolean;
}

export default function AnswerDistributionChart({
  questionText,
  choices = [],
  correctIndex,
  stats,
  totalResponses,
  showCorrectAnswer = true
}: AnswerDistributionChartProps) {
  const answerLabels = ['A', 'B', 'C', 'D'];
  
  // Guard against missing choices
  if (!choices || choices.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy-light to-millionaire-blue rounded-lg shadow-glow-gold p-6 border-2 border-millionaire-gold"
      >
        <p className="text-gray-300">No answer choices available</p>
      </motion.div>
    );
  }
  
  // Default bar colors (blue shades for all)
  const defaultBarColor = 'bg-millionaire-blue';
  const correctBarColor = 'bg-emerald-500';
  
  const maxPercentage = Math.max(...stats.map(s => s.percentage), 1);
  const chartHeight = 200; // pixels for the chart area

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy-light to-millionaire-blue rounded-lg shadow-glow-gold p-6 border-2 border-millionaire-gold"
    >
      {/* Header */}
      <div className="mb-6">
        <h3 className="text-2xl font-bold text-white mb-2 drop-shadow-lg">Answer Distribution</h3>
        <p className="text-gray-300 text-sm">{questionText}</p>
        <p className="text-millionaire-gold font-semibold mt-2 drop-shadow-lg">
          {totalResponses} {totalResponses === 1 ? 'response' : 'responses'}
        </p>
      </div>

      {/* Vertical Bar Chart */}
      <div className="relative">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-[200px] flex flex-col justify-between text-xs text-gray-400 pr-2">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
          <span>0%</span>
        </div>
        
        {/* Chart area */}
        <div className="ml-10">
          {/* Grid lines */}
          <div className="relative h-[200px] border-l-2 border-b-2 border-gray-500/50">
            {[0, 25, 50, 75].map((line) => (
              <div
                key={line}
                className="absolute w-full border-t border-gray-500/30"
                style={{ bottom: `${line}%` }}
              />
            ))}
            
            {/* Bars container */}
            <div className="absolute inset-0 flex items-end justify-around px-4">
              {stats.map((stat) => {
                const isCorrect = stat.choiceIndex === correctIndex;
                const barHeight = maxPercentage > 0 ? (stat.percentage / 100) * chartHeight : 0;
                const barColor = showCorrectAnswer && isCorrect ? correctBarColor : defaultBarColor;
                
                return (
                  <div
                    key={stat.choiceIndex}
                    className={`flex flex-col items-center transition-all duration-500 ${
                      showCorrectAnswer && !isCorrect ? 'opacity-50' : ''
                    }`}
                    style={{ width: '20%' }}
                  >
                    {/* Correct Answer Badge */}
                    {showCorrectAnswer && isCorrect && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.8, type: 'spring', stiffness: 200 }}
                        className="absolute -top-8 bg-emerald-500 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg shadow-emerald-500/50 animate-pulse"
                      >
                        ✓ CORRECT
                      </motion.div>
                    )}
                    
                    {/* Percentage label above bar */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 + stat.choiceIndex * 0.1 }}
                      className={`text-sm font-bold mb-1 ${
                        showCorrectAnswer && isCorrect 
                          ? 'text-emerald-400 text-lg' 
                          : showCorrectAnswer && !isCorrect 
                            ? 'text-gray-500'
                            : 'text-white'
                      }`}
                    >
                      {stat.percentage.toFixed(0)}%
                    </motion.div>
                    
                    {/* Bar */}
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: barHeight }}
                      transition={{ duration: 0.8, delay: stat.choiceIndex * 0.1 }}
                      className={`w-full max-w-[60px] rounded-t-lg relative ${
                        showCorrectAnswer && isCorrect 
                          ? `${barColor} ring-4 ring-emerald-300 shadow-[0_0_30px_rgba(16,185,129,0.7)]` 
                          : showCorrectAnswer && !isCorrect
                            ? 'bg-gray-600'
                            : barColor
                      }`}
                    >
                      {/* Count inside bar if tall enough */}
                      {barHeight > 30 && (
                        <span className="absolute inset-0 flex items-center justify-center text-white font-bold text-sm">
                          {stat.count}
                        </span>
                      )}
                    </motion.div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* X-axis labels (answer choices) */}
          <div className="flex justify-around px-4 mt-3">
            {stats.map((stat) => {
              const isCorrect = stat.choiceIndex === correctIndex;
              return (
                <div
                  key={stat.choiceIndex}
                  className={`text-center transition-all duration-500 ${
                    showCorrectAnswer && isCorrect 
                      ? 'transform scale-110' 
                      : showCorrectAnswer && !isCorrect 
                        ? 'opacity-50'
                        : ''
                  }`}
                  style={{ width: '20%' }}
                >
                  <div className={`inline-flex items-center justify-center w-10 h-10 rounded-full font-bold text-base mb-1 transition-all duration-500 ${
                    showCorrectAnswer && isCorrect 
                      ? 'bg-emerald-500 text-white ring-4 ring-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.6)]' 
                      : showCorrectAnswer && !isCorrect
                        ? 'bg-gray-600 text-gray-400'
                        : 'bg-millionaire-blue text-white'
                  }`}>
                    {showCorrectAnswer && isCorrect ? '✓' : answerLabels[stat.choiceIndex]}
                  </div>
                  <p className={`text-xs leading-tight line-clamp-2 transition-all duration-500 ${
                    showCorrectAnswer && isCorrect 
                      ? 'text-emerald-400 font-bold text-sm' 
                      : showCorrectAnswer && !isCorrect
                        ? 'text-gray-500'
                        : 'text-gray-300'
                  }`}>
                    {choices[stat.choiceIndex] || `Answer ${answerLabels[stat.choiceIndex]}`}
                  </p>
                  {showCorrectAnswer && isCorrect && (
                    <motion.span
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1 }}
                      className="inline-block mt-1 text-emerald-400 text-xs font-bold bg-emerald-500/20 px-2 py-0.5 rounded"
                    >
                      CORRECT ANSWER
                    </motion.span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 pt-4 border-t border-millionaire-gold/30">
        <div className="flex justify-between items-center">
          <span className={`text-sm ${showCorrectAnswer ? 'text-emerald-400 font-semibold' : 'text-gray-300'}`}>
            Correct answers: {stats[correctIndex]?.count || 0} ({(stats[correctIndex]?.percentage ?? 0).toFixed(1)}%)
          </span>
          <span className="text-sm text-gray-300">
            Incorrect: {totalResponses - (stats[correctIndex]?.count || 0)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
