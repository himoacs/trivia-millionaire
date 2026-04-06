import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Question } from '@trivia-millionaire/shared';

interface AIGenerateModalProps {
  onClose: () => void;
  onGenerate: (topic: string, count: number, docs?: string) => Promise<Question[]>;
  onSave: (questions: Question[]) => void;
}

export default function AIGenerateModal({ onClose, onGenerate, onSave }: AIGenerateModalProps) {
  const [topic, setTopic] = useState('');
  const [count, setCount] = useState(5);
  const [docs, setDocs] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Edit form state
  const [editText, setEditText] = useState('');
  const [editChoices, setEditChoices] = useState(['', '', '', '']);
  const [editCorrectIndex, setEditCorrectIndex] = useState(0);
  const [editTimeLimit, setEditTimeLimit] = useState(30);
  const [editPoints, setEditPoints] = useState(1000);

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic');
      return;
    }

    if (count < 1 || count > 20) {
      setError('Please enter a count between 1 and 20');
      return;
    }

    setError('');
    setIsGenerating(true);

    try {
      const questions = await onGenerate(topic, count, docs || undefined);
      setGeneratedQuestions(questions);
    } catch (err: any) {
      setError(err.message || 'Failed to generate questions');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = (index: number) => {
    const q = generatedQuestions[index];
    setEditingIndex(index);
    setEditText(q.text);
    setEditChoices([...q.choices]);
    setEditCorrectIndex(q.correctIndex);
    setEditTimeLimit(q.timeLimit);
    setEditPoints(q.points);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;

    const updated = [...generatedQuestions];
    updated[editingIndex] = {
      ...updated[editingIndex],
      text: editText,
      choices: [...editChoices],
      correctIndex: editCorrectIndex,
      timeLimit: editTimeLimit,
      points: editPoints
    };

    setGeneratedQuestions(updated);
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
  };

  const handleDelete = (index: number) => {
    setGeneratedQuestions(generatedQuestions.filter((_, i) => i !== index));
  };

  const handleSaveAll = () => {
    if (generatedQuestions.length === 0) {
      setError('No questions to save');
      return;
    }
    onSave(generatedQuestions);
  };

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
        className="bg-gradient-to-br from-millionaire-purple-dark via-millionaire-purple to-millionaire-blue rounded-lg shadow-glow-gold border-2 border-millionaire-gold max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-millionaire-purple-dark to-millionaire-blue p-6 flex items-center justify-between border-b-2 border-millionaire-gold">
          <h2 className="text-2xl font-bold text-white drop-shadow-lg">🤖 Generate Questions with AI</h2>
          <button onClick={onClose} className="text-3xl text-white hover:text-millionaire-gold leading-none transition-colors">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {generatedQuestions.length === 0 ? (
            /* Generation Form */
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                  Topic <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="e.g., World Geography, JavaScript Basics, Movie Trivia..."
                  className="w-full px-4 py-3 bg-millionaire-dark-light border-2 border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white placeholder-gray-400"
                  disabled={isGenerating}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                  Number of Questions <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={count}
                  onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-3 bg-millionaire-dark-light border-2 border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-white"
                  disabled={isGenerating}
                />
                <p className="text-sm text-gray-300 mt-1">Between 1 and 20 questions</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-millionaire-gold mb-2">
                  Reference Documents (Optional)
                </label>
                <textarea
                  value={docs}
                  onChange={(e) => setDocs(e.target.value)}
                  placeholder="Paste any reference text, documentation, or context that AI should use to generate questions..."
                  className="w-full px-4 py-3 bg-millionaire-dark-light border-2 border-millionaire-gold/50 rounded-lg focus:outline-none focus:ring-2 focus:ring-millionaire-gold h-32 resize-none text-white placeholder-gray-400"
                  disabled={isGenerating}
                />
                <p className="text-sm text-gray-300 mt-1">
                  Provide context or documentation for more accurate questions
                </p>
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-4 text-lg bg-millionaire-gold hover:bg-millionaire-gold-light text-millionaire-purple-dark font-bold rounded-lg transition-colors shadow-glow-gold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-3" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Generating Questions...
                  </span>
                ) : (
                  '✨ Generate Questions'
                )}
              </button>
            </div>
          ) : (
            /* Generated Questions List */
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">
                  Generated {generatedQuestions.length} Question{generatedQuestions.length !== 1 ? 's' : ''}
                </h3>
                <button
                  onClick={() => setGeneratedQuestions([])}
                  className="text-sm text-millionaire-gold hover:text-millionaire-gold-light transition-colors"
                >
                  🔄 Start Over
                </button>
              </div>

              {generatedQuestions.map((q, index) => (
                <div key={q.id} className="bg-millionaire-dark-light/80 border-2 border-millionaire-gold/40 rounded-lg p-4">
                  {editingIndex === index ? (
                    /* Edit Mode */
                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-semibold text-millionaire-gold mb-1">
                          Question
                        </label>
                        <input
                          type="text"
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          className="w-full px-3 py-2 bg-millionaire-dark border border-millionaire-gold/50 rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-sm text-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {editChoices.map((choice, i) => (
                          <div key={i}>
                            <label className="flex items-center space-x-1 text-xs font-semibold text-gray-300 mb-1">
                              <input
                                type="radio"
                                checked={editCorrectIndex === i}
                                onChange={() => setEditCorrectIndex(i)}
                                className="w-3 h-3 accent-emerald-500"
                              />
                              <span>Choice {String.fromCharCode(65 + i)} {editCorrectIndex === i && <span className="text-emerald-400">✓</span>}</span>
                            </label>
                            <input
                              type="text"
                              value={choice}
                              onChange={(e) => {
                                const newChoices = [...editChoices];
                                newChoices[i] = e.target.value;
                                setEditChoices(newChoices);
                              }}
                              className="w-full px-3 py-2 bg-millionaire-dark border border-millionaire-gold/30 rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-sm text-white"
                            />
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-xs font-semibold text-gray-300 mb-1">
                            Time (seconds)
                          </label>
                          <input
                            type="number"
                            value={editTimeLimit}
                            onChange={(e) => setEditTimeLimit(parseInt(e.target.value) || 30)}
                            className="w-full px-3 py-2 bg-millionaire-dark border border-millionaire-gold/30 rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-sm text-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-300 mb-1">
                            Points
                          </label>
                          <input
                            type="number"
                            value={editPoints}
                            onChange={(e) => setEditPoints(parseInt(e.target.value) || 1000)}
                            className="w-full px-3 py-2 bg-millionaire-dark border border-millionaire-gold/30 rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-sm text-white"
                          />
                        </div>
                      </div>

                      <div className="flex space-x-2 pt-2">
                        <button
                          onClick={handleSaveEdit}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-semibold text-sm transition-colors"
                        >
                          ✓ Save
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-semibold text-sm transition-colors"
                        >
                          ✕ Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display Mode */
                    <div>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="font-semibold text-white">
                            Q{index + 1}: {q.text}
                          </div>
                          <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                            {q.choices.map((choice, i) => (
                              <div
                                key={i}
                                className={`px-3 py-2 rounded ${
                                  i === q.correctIndex
                                    ? 'bg-emerald-600/30 text-emerald-300 font-semibold border border-emerald-500'
                                    : 'bg-millionaire-dark/50 text-gray-300 border border-gray-600'
                                }`}
                              >
                                {String.fromCharCode(65 + i)}: {choice}
                                {i === q.correctIndex && ' ✓'}
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-gray-400 mt-2">
                            ⏱️ {q.timeLimit}s · 🏆 {q.points} pts
                          </div>
                        </div>
                        <div className="flex space-x-2 ml-3">
                          <button
                            onClick={() => handleEdit(index)}
                            className="px-3 py-2 bg-millionaire-blue hover:bg-millionaire-blue-light text-white rounded font-semibold text-sm transition-colors"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            onClick={() => handleDelete(index)}
                            className="px-3 py-2 bg-red-600 hover:bg-red-500 text-white rounded font-semibold text-sm transition-colors"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {generatedQuestions.length > 0 && (
          <div className="border-t border-millionaire-gold/30 p-4 flex space-x-3 bg-millionaire-purple-dark/80">
            <button
              onClick={handleSaveAll}
              className="flex-1 py-3 text-lg bg-millionaire-gold hover:bg-millionaire-gold-light text-millionaire-purple-dark font-bold rounded-lg transition-colors shadow-glow-gold"
            >
              💾 Add All Questions ({generatedQuestions.length})
            </button>
            <button
              onClick={onClose}
              className="px-6 py-3 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
