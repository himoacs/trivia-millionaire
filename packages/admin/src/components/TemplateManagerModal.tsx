import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface Template {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface TemplateManagerModalProps {
  sessionId: string;
  onClose: () => void;
  onLoadTemplate: (templateId: string, replaceExisting: boolean) => Promise<void>;
  onSaveAsTemplate: (name: string, description: string) => Promise<void>;
  onDeleteTemplate: (templateId: string) => Promise<void>;
  fetchTemplates: () => Promise<Template[]>;
}

export default function TemplateManagerModal({
  sessionId: _sessionId,
  onClose,
  onLoadTemplate,
  onSaveAsTemplate,
  onDeleteTemplate,
  fetchTemplates
}: TemplateManagerModalProps) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Save as template form
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  
  // Load template options
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const data = await fetchTemplates();
      setTemplates(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load templates');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!newTemplateName.trim()) {
      setError('Please enter a template name');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      await onSaveAsTemplate(newTemplateName, newTemplateDescription);
      setSuccess('Template saved successfully!');
      setShowSaveForm(false);
      setNewTemplateName('');
      setNewTemplateDescription('');
      await loadTemplates();
    } catch (err: any) {
      setError(err.message || 'Failed to save template');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadTemplate = async () => {
    if (!selectedTemplateId) {
      setError('Please select a template');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      await onLoadTemplate(selectedTemplateId, replaceExisting);
      setSuccess('Template loaded successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to load template');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;
    setIsProcessing(true);
    setError('');
    try {
      await onDeleteTemplate(templateId);
      setSuccess('Template deleted');
      await loadTemplates();
      if (selectedTemplateId === templateId) {
        setSelectedTemplateId(null);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete template');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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
        className="bg-[#1a1a2e] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Saved Templates</h2>
          <button 
            onClick={onClose}
            className="btn-icon-ghost btn-icon-sm text-white hover:text-blue-200"
            title="Close template manager"
            aria-label="Close template manager"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
          {error && (
            <div className="bg-red-900/50 border border-red-700 text-red-200 px-4 py-2 rounded-lg">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-900/50 border border-green-700 text-green-200 px-4 py-2 rounded-lg">
              {success}
            </div>
          )}

          {/* Save as Template Section */}
          <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/50">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-lg font-semibold text-white">Save Current Session as Template</h3>
              <button
                onClick={() => setShowSaveForm(!showSaveForm)}
                className="btn-primary py-1 px-3 text-sm"
              >
                {showSaveForm ? 'Cancel' : 'Save New'}
              </button>
            </div>
            
            <AnimatePresence>
              {showSaveForm && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-3 pt-3 border-t border-gray-700 mt-3">
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Template Name *</label>
                      <input
                        type="text"
                        value={newTemplateName}
                        onChange={(e) => setNewTemplateName(e.target.value)}
                        placeholder="e.g., Solace Workshop Quiz"
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
                      <textarea
                        value={newTemplateDescription}
                        onChange={(e) => setNewTemplateDescription(e.target.value)}
                        placeholder="Brief description of this template..."
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-amber-500 focus:outline-none resize-none h-20"
                      />
                    </div>
                    <button
                      onClick={handleSaveAsTemplate}
                      disabled={isProcessing || !newTemplateName.trim()}
                      className="btn-primary w-full py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? 'Saving...' : 'Save Template'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Templates List */}
          <div className="border border-gray-700 rounded-lg p-4 bg-gray-900/50">
            <h3 className="text-lg font-semibold text-white mb-3">Load from Template</h3>
            
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">
                Loading templates...
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                No saved templates yet. Save your first template above!
              </div>
            ) : (
              <>
                <div className="space-y-2 mb-4 max-h-60 overflow-y-auto">
                  {templates.map((template) => (
                    <div
                      key={template.id}
                      onClick={() => setSelectedTemplateId(template.id)}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedTemplateId === template.id
                          ? 'bg-blue-900/50 border border-blue-500'
                          : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white truncate">{template.name}</div>
                        {template.description && (
                          <div className="text-sm text-gray-400 truncate">{template.description}</div>
                        )}
                        <div className="text-xs text-gray-500 mt-1">
                          {formatDate(template.createdAt)}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteTemplate(template.id);
                        }}
                        className="btn-icon-danger btn-icon-sm ml-2"
                        title="Delete template"
                        aria-label={`Delete template ${template.name}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                <div className="space-y-3 pt-3 border-t border-gray-700">
                  <label className="flex items-center gap-2 text-gray-300">
                    <input
                      type="checkbox"
                      checked={replaceExisting}
                      onChange={(e) => setReplaceExisting(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500"
                    />
                    Replace existing rounds (unchecked = append)
                  </label>

                  <button
                    onClick={handleLoadTemplate}
                    disabled={isProcessing || !selectedTemplateId}
                    className="btn-secondary w-full py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Loading...' : 'Load Selected Template'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
