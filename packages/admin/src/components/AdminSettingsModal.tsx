import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { AdminSettings } from '@trivia-millionaire/shared';

interface AdminSettingsModalProps {
  sessionId: string;
  onClose: () => void;
}

export default function AdminSettingsModal({ sessionId, onClose }: AdminSettingsModalProps) {
  const [provider, setProvider] = useState<'litellm' | 'openai' | 'anthropic' | ''>('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [model, setModel] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const API_URL = import.meta.env.VITE_API_URL ?? '';

  // Load existing settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch(`${API_URL}/api/admin/session/${sessionId}/settings`);
        const data = await response.json();
        
        if (data.success && data.data) {
          const settings: AdminSettings = data.data;
          setProvider(settings.provider || '');
          setApiKey(settings.apiKey || '');
          setBaseUrl(settings.baseUrl || '');
          setModel(settings.model || '');
        }
      } catch (err) {
        console.error('Failed to load settings:', err);
        setError('Failed to load existing settings');
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [sessionId, API_URL]);

  const handleSave = async () => {
    // Validation
    if (!provider) {
      setError('Please select a provider');
      return;
    }

    if (!apiKey.trim()) {
      setError('Please enter an API key');
      return;
    }

    if (provider === 'litellm' && !baseUrl.trim()) {
      setError('Base URL is required for LiteLLM');
      return;
    }

    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      const settings: AdminSettings = {
        provider,
        apiKey: apiKey.trim(),
        baseUrl: baseUrl.trim() || undefined,
        model: model.trim() || undefined
      };

      const response = await fetch(`${API_URL}/api/admin/session/${sessionId}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Settings saved successfully!');
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(data.error || 'Failed to save settings');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('Are you sure you want to clear all AI settings?')) {
      return;
    }

    setError('');
    setSuccess('');
    setIsSaving(true);

    try {
      const response = await fetch(`${API_URL}/api/admin/session/${sessionId}/settings`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        setProvider('');
        setApiKey('');
        setBaseUrl('');
        setModel('');
        setSuccess('Settings cleared successfully!');
      } else {
        setError(data.error || 'Failed to clear settings');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to clear settings');
    } finally {
      setIsSaving(false);
    }
  };

  const getModelPlaceholder = () => {
    switch (provider) {
      case 'litellm':
        return 'e.g., bedrock-claude-4-5-sonnet, gpt-4';
      case 'openai':
        return 'e.g., gpt-4, gpt-3.5-turbo';
      case 'anthropic':
        return 'e.g., claude-3-opus-20240229';
      default:
        return 'Model name (optional)';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-gray-900 to-gray-950 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-millionaire-blue/30"
      >
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-millionaire-navy-dark to-millionaire-navy px-6 py-4 border-b border-millionaire-blue/30 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">⚙️ AI Settings</h2>
            <p className="text-sm text-gray-400 mt-1">
              Configure AI provider for question generation and helpline
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn-icon-ghost"
            title="Close settings"
            aria-label="Close settings modal"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-4">⏳</div>
              <p className="text-gray-400">Loading settings...</p>
            </div>
          ) : (
            <>
              {/* Error message */}
              {error && (
                <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4">
                  <p className="text-red-400 text-sm">{error}</p>
                </div>
              )}

              {/* Success message */}
              {success && (
                <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4">
                  <p className="text-green-400 text-sm">{success}</p>
                </div>
              )}

              {/* Provider Selection */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  AI Provider *
                </label>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value as any)}
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500"
                  disabled={isSaving}
                >
                  <option value="">-- Select Provider --</option>
                  <option value="litellm">LiteLLM (Recommended - supports multiple providers)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic Claude</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose your AI provider. LiteLLM allows you to use multiple models through one API.
                </p>
              </div>

              {/* API Key */}
              {provider && (
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    API Key *
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    disabled={isSaving}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your API key is stored securely in server memory only (not persisted to disk).
                  </p>
                </div>
              )}

              {/* Base URL (required for LiteLLM, optional for others) */}
              {provider && (
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Base URL {provider === 'litellm' && '*'}
                  </label>
                  <input
                    type="url"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder={
                      provider === 'litellm'
                        ? 'e.g., https://lite-llm.mymaas.net'
                        : 'Custom API endpoint (optional)'
                    }
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    disabled={isSaving}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {provider === 'litellm'
                      ? 'Required for LiteLLM. The URL of your LiteLLM proxy server.'
                      : 'Optional. Override the default API endpoint.'}
                  </p>
                </div>
              )}

              {/* Model */}
              {provider && (
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-2">
                    Model
                  </label>
                  <input
                    type="text"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={getModelPlaceholder()}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                    disabled={isSaving}
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Optional. Specify which model to use. Leave blank for provider default.
                  </p>
                </div>
              )}

              {/* Info box */}
              {!provider && (
                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-blue-300 text-sm mb-2">
                    <strong>💡 Why configure AI settings?</strong>
                  </p>
                  <ul className="text-blue-300 text-sm space-y-1 list-disc list-inside">
                    <li>Use AI to generate trivia questions automatically</li>
                    <li>Enable AI helpline feature for players (coming soon)</li>
                    <li>Settings are session-scoped and secure (memory only)</li>
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!isLoading && (
          <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur-sm px-6 py-4 border-t border-gray-800 flex justify-between gap-3">
            <button
              onClick={handleClear}
              disabled={isSaving || !provider}
              className="btn-danger"
              title="Clear all AI settings"
            >
              Clear Settings
            </button>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={isSaving}
                className="btn-ghost"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || !provider}
                className="btn-ai"
                title="Save AI configuration"
              >
                {isSaving ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Saving...
                  </>
                ) : (
                  'Save Settings'
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
