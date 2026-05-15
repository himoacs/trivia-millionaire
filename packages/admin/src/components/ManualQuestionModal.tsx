import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { Question, QuestionDifficulty } from '@trivia-millionaire/shared';
import yaml from 'js-yaml';

interface ManualQuestionModalProps {
  onClose: () => void;
  onSave: (questions: Question[]) => void;
  editQuestion?: Question;
}

export default function ManualQuestionModal({ onClose, onSave, editQuestion }: ManualQuestionModalProps) {
  const [activeTab, setActiveTab] = useState<'form' | 'yaml'>('form');
  
  // Form state
  const [questionText, setQuestionText] = useState('');
  const [choice1, setChoice1] = useState('');
  const [choice2, setChoice2] = useState('');
  const [choice3, setChoice3] = useState('');
  const [choice4, setChoice4] = useState('');
  const [correctIndex, setCorrectIndex] = useState(0);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('medium');
  const [timeLimit, setTimeLimit] = useState(30);
  
  // YAML state
  const [yamlContent, setYamlContent] = useState('');
  const [yamlError, setYamlError] = useState('');

  // Pre-fill form if editing
  useEffect(() => {
    if (editQuestion) {
      setQuestionText(editQuestion.text);
      setChoice1(editQuestion.choices[0] || '');
      setChoice2(editQuestion.choices[1] || '');
      setChoice3(editQuestion.choices[2] || '');
      setChoice4(editQuestion.choices[3] || '');
      setCorrectIndex(editQuestion.correctIndex);
      setDifficulty(editQuestion.difficulty || 'medium');
      setTimeLimit(editQuestion.timeLimit);
    }
  }, [editQuestion]);

  const handleSaveForm = () => {
    if (!questionText.trim() || !choice1.trim() || !choice2.trim() || !choice3.trim() || !choice4.trim()) {
      alert('Please fill in all fields');
      return;
    }

    const question: Question = {
      id: editQuestion?.id || `q${Date.now()}`,
      text: questionText,
      choices: [choice1, choice2, choice3, choice4],
      correctIndex,
      timeLimit,
      points: 1000,
      difficulty
    };

    onSave([question]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setYamlContent(content);
      setYamlError('');
    };
    reader.readAsText(file);
  };

  const handleSaveYaml = () => {
    try {
      const parsed = yaml.load(yamlContent) as any;
      
      if (!parsed.questions || !Array.isArray(parsed.questions)) {
        setYamlError('YAML must contain a "questions" array');
        return;
      }

      const questions: Question[] = parsed.questions.map((q: any, idx: number) => {
        if (!q.text || !q.choices || !Array.isArray(q.choices) || q.choices.length !== 4) {
          throw new Error(`Question ${idx + 1}: Must have text and 4 choices`);
        }
        if (q.correctIndex === undefined || q.correctIndex < 0 || q.correctIndex > 3) {
          throw new Error(`Question ${idx + 1}: correctIndex must be 0-3`);
        }

        return {
          id: `q${Date.now()}-${idx}`,
          text: q.text,
          choices: q.choices,
          correctIndex: q.correctIndex,
          timeLimit: q.timeLimit || 30,
          points: 1000,
          difficulty: q.difficulty || 'medium'
        };
      });

      onSave(questions);
    } catch (error: any) {
      setYamlError(error.message || 'Invalid YAML format');
    }
  };

  const answerColors = [
    { bg: 'bg-orange-500', light: 'bg-orange-500/20', label: 'A' },
    { bg: 'bg-blue-500', light: 'bg-blue-500/20', label: 'B' },
    { bg: 'bg-yellow-500', light: 'bg-yellow-500/20', label: 'C' },
    { bg: 'bg-emerald-500', light: 'bg-emerald-500/20', label: 'D' }
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-gradient-to-br from-millionaire-navy-dark via-millionaire-navy-light to-millionaire-blue rounded-lg shadow-glow-gold border-2 border-millionaire-gold max-w-3xl w-full max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-millionaire-navy-dark to-millionaire-blue p-6 flex items-center justify-between border-b-2 border-millionaire-gold">
          <h2 className="text-2xl font-bold text-white drop-shadow-lg">
            {editQuestion ? '✏️ Edit Question' : '➕ Add Question(s)'}
          </h2>
          <button 
            onClick={onClose} 
            className="btn-icon-ghost btn-icon-sm text-white hover:text-millionaire-gold"
            title="Close"
            aria-label="Close question editor"
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex">
          <button
            onClick={() => setActiveTab('form')}
            className={`flex-1 py-3 px-6 font-semibold transition-colors ${
              activeTab === 'form'
                ? 'bg-millionaire-gold text-millionaire-navy-dark'
                : 'bg-millionaire-navy-dark/50 text-white hover:bg-millionaire-navy-dark/80'
            }`}
          >
            📝 Manual Entry
          </button>
          {!editQuestion && (
            <button
              onClick={() => setActiveTab('yaml')}
              className={`flex-1 py-3 px-6 font-semibold transition-colors ${
                activeTab === 'yaml'
                  ? 'bg-millionaire-gold text-millionaire-navy-dark'
                  : 'bg-millionaire-navy-dark/50 text-white hover:bg-millionaire-navy-dark/80'
              }`}
            >
              📄 YAML Import
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 250px)' }}>
          {activeTab === 'form' ? (
            <div className="space-y-5">
              {/* Question Text */}
              <div>
                <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                  Question Text
                </label>
                <input
                  type="text"
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  placeholder="Enter your question..."
                  className="w-full px-4 py-3 bg-millionaire-dark-light border-2 border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white placeholder-gray-400"
                />
              </div>

              {/* Choices */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[
                  { label: 'Choice A', value: choice1, setter: setChoice1, index: 0 },
                  { label: 'Choice B', value: choice2, setter: setChoice2, index: 1 },
                  { label: 'Choice C', value: choice3, setter: setChoice3, index: 2 },
                  { label: 'Choice D', value: choice4, setter: setChoice4, index: 3 }
                ].map((choice) => (
                  <div key={choice.index} className={`p-3 rounded-lg ${answerColors[choice.index].light} border border-white/20`}>
                    <label className="flex items-center space-x-2 text-sm font-semibold text-white mb-2">
                      <input
                        type="radio"
                        name="correctAnswer"
                        checked={correctIndex === choice.index}
                        onChange={() => setCorrectIndex(choice.index)}
                        className="w-4 h-4 accent-millionaire-gold"
                      />
                      <span className={`inline-flex items-center justify-center w-6 h-6 rounded ${answerColors[choice.index].bg} text-white font-bold text-xs`}>
                        {answerColors[choice.index].label}
                      </span>
                      <span>{choice.label} {correctIndex === choice.index && <span className="text-emerald-400">✓ Correct</span>}</span>
                    </label>
                    <input
                      type="text"
                      value={choice.value}
                      onChange={(e) => choice.setter(e.target.value)}
                      placeholder={`Enter ${choice.label}...`}
                      className="w-full px-4 py-2 bg-millionaire-dark border border-millionaire-gold/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white placeholder-gray-500"
                    />
                  </div>
                ))}
              </div>

              {/* Settings Row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                    Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                    className="w-full px-3 py-2 bg-millionaire-dark-light border border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                    Time (sec)
                  </label>
                  <input
                    type="number"
                    value={timeLimit}
                    onChange={(e) => setTimeLimit(parseInt(e.target.value) || 30)}
                    min="5"
                    max="120"
                    className="w-full px-3 py-2 bg-millionaire-dark-light border border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Upload */}
              <div>
                <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                  Upload YAML File
                </label>
                <input
                  type="file"
                  accept=".yaml,.yml"
                  onChange={handleFileUpload}
                  className="w-full px-4 py-2 bg-millionaire-dark-light border border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-millionaire-gold file:text-millionaire-navy-dark file:font-semibold hover:file:bg-millionaire-gold-light"
                />
              </div>

              {/* YAML Editor */}
              <div>
                <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                  Or Paste YAML Content
                </label>
                <textarea
                  value={yamlContent}
                  onChange={(e) => setYamlContent(e.target.value)}
                  placeholder={`questions:
  - text: "What is the capital of France?"
    choices:
      - "London"
      - "Berlin"
      - "Paris"
      - "Madrid"
    correctIndex: 2
    timeLimit: 30
    difficulty: "easy"
  - text: "Who painted the Mona Lisa?"
    choices:
      - "Van Gogh"
      - "Da Vinci"
      - "Picasso"
      - "Monet"
    correctIndex: 1
    timeLimit: 20`}
                  rows={15}
                  className="w-full px-4 py-3 bg-millionaire-dark-light border border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold font-mono text-sm text-white placeholder-gray-500"
                />
              </div>

              {/* Error Message */}
              {yamlError && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                  <strong>Error:</strong> {yamlError}
                </div>
              )}

              {/* Format Help */}
              <div className="bg-millionaire-blue/30 border border-millionaire-blue text-blue-200 px-4 py-3 rounded-lg text-sm">
                <strong>Format:</strong> Each question must have text, choices (array of 4), 
                correctIndex (0-3), and optionally timeLimit and difficulty.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-millionaire-navy-dark/80 px-6 py-4 flex justify-end space-x-3 border-t border-millionaire-gold/30">
          <button
            onClick={onClose}
            className="btn-ghost"
          >
            Cancel
          </button>
          <button
            onClick={activeTab === 'form' ? handleSaveForm : handleSaveYaml}
            className="btn-primary"
          >
            {editQuestion ? 'Save Changes' : 'Add Question'}{activeTab === 'yaml' && !editQuestion ? 's' : ''}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
