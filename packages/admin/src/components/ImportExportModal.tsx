import { useState, useRef } from 'react';
import { motion } from 'framer-motion';

interface ImportExportModalProps {
  sessionId: string;
  sessionName: string;
  onClose: () => void;
  onImport: (yamlContent: string, replaceExisting: boolean) => Promise<void>;
  onExport: () => Promise<{ yaml: string; filename: string }>;
}

export default function ImportExportModal({ 
  sessionId, 
  sessionName, 
  onClose, 
  onImport, 
  onExport 
}: ImportExportModalProps) {
  const [activeTab, setActiveTab] = useState<'import' | 'export'>('export');
  const [yamlContent, setYamlContent] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [exportedYaml, setExportedYaml] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsProcessing(true);
    setError('');
    try {
      const result = await onExport();
      setExportedYaml(result.yaml);
      setSuccess('Exported successfully! You can copy or download the YAML below.');
    } catch (err: any) {
      setError(err.message || 'Failed to export');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!exportedYaml) return;
    const blob = new Blob([exportedYaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${sessionName.replace(/\s+/g, '_')}_export.yaml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    if (!exportedYaml) return;
    try {
      await navigator.clipboard.writeText(exportedYaml);
      setSuccess('Copied to clipboard!');
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleImport = async () => {
    if (!yamlContent.trim()) {
      setError('Please enter or upload YAML content');
      return;
    }
    setIsProcessing(true);
    setError('');
    try {
      await onImport(yamlContent, replaceExisting);
      setSuccess('Imported successfully!');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to import');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setYamlContent(content);
      setError('');
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
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
        <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">Import / Export</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-amber-200 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            onClick={() => { setActiveTab('export'); setError(''); setSuccess(''); }}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'export'
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-900/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Export YAML
          </button>
          <button
            onClick={() => { setActiveTab('import'); setError(''); setSuccess(''); }}
            className={`flex-1 py-3 px-4 text-center font-medium transition-colors ${
              activeTab === 'import'
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-900/20'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            Import YAML
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[60vh]">
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

          {activeTab === 'export' && (
            <div className="space-y-4">
              <p className="text-gray-300">
                Export all rounds and questions from this session as a YAML file.
              </p>
              
              {!exportedYaml ? (
                <button
                  onClick={handleExport}
                  disabled={isProcessing}
                  className="btn-primary w-full py-3"
                >
                  {isProcessing ? 'Exporting...' : 'Generate Export'}
                </button>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDownload}
                      className="btn-primary flex-1 py-2"
                    >
                      Download YAML
                    </button>
                    <button
                      onClick={handleCopyToClipboard}
                      className="btn-secondary flex-1 py-2"
                    >
                      Copy to Clipboard
                    </button>
                  </div>
                  <div className="relative">
                    <textarea
                      value={exportedYaml}
                      readOnly
                      className="w-full h-64 bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-300 font-mono text-sm resize-none"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'import' && (
            <div className="space-y-4">
              <p className="text-gray-300">
                Import rounds and questions from a YAML file.
              </p>
              
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-gray-300">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-amber-500 focus:ring-amber-500"
                  />
                  Replace existing rounds (unchecked = append)
                </label>
              </div>

              <div className="flex gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".yaml,.yml"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-secondary py-2 px-4"
                >
                  Upload File
                </button>
                <span className="text-gray-400 text-sm self-center">
                  or paste YAML content below
                </span>
              </div>

              <textarea
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                placeholder={`name: "Quiz Name"
rounds:
  - name: "Round 1"
    questions:
      - text: "What is 2 + 2?"
        choices: ["3", "4", "5", "6"]
        correctIndex: 1
        timeLimit: 30
        difficulty: easy`}
                className="w-full h-48 bg-gray-900 border border-gray-700 rounded-lg p-4 text-gray-300 font-mono text-sm resize-none placeholder-gray-600"
              />

              <button
                onClick={handleImport}
                disabled={isProcessing || !yamlContent.trim()}
                className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'Importing...' : 'Import'}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}
