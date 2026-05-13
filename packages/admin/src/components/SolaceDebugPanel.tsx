import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PRESET_SUBSCRIPTIONS, SolaceMessage, getMessageTypeFromTopic, replaceTopicPlaceholder } from '@trivia-millionaire/shared';
import { useSolace } from '../hooks/useSolace';

interface SolaceDebugPanelProps {
  sessionId: string;
  onClose: () => void;
}

export default function SolaceDebugPanel({ sessionId, onClose }: SolaceDebugPanelProps) {
  const [messages, setMessages] = useState<SolaceMessage[]>([]);
  const [selectedPattern, setSelectedPattern] = useState('');
  const [customPattern, setCustomPattern] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [activeSubscription, setActiveSubscription] = useState<string>('');
  const [width, setWidth] = useState(500);
  const [isResizing, setIsResizing] = useState(false);
  const [unsubscribeFn, setUnsubscribeFn] = useState<(() => void) | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Connect to Solace
  const { connected, subscribe } = useSolace();

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (!isPaused) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isPaused]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  }, [unsubscribeFn]);

  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(300, Math.min(newWidth, window.innerWidth - 200)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  const handleSubscribe = () => {
    const pattern = customPattern || selectedPattern;
    if (!pattern) return;

    // Unsubscribe from previous subscription
    if (unsubscribeFn) {
      unsubscribeFn();
    }

    const finalPattern = replaceTopicPlaceholder(pattern, sessionId);
    setActiveSubscription(finalPattern);
    
    // Subscribe to Solace
    const unsub = subscribe(finalPattern, (message) => {
      const solaceMsg: SolaceMessage = {
        id: `msg-${Date.now()}-${Math.random()}`,
        topic: message.topic,
        payload: message.payload,
        timestamp: message.timestamp,
        messageType: getMessageTypeFromTopic(message.topic)
      };
      setMessages(prev => [...prev, solaceMsg]);
    });

    setUnsubscribeFn(() => unsub);
    addSystemMessage(`✅ Subscribed to: ${finalPattern}`);
  };

  const handleClear = () => {
    setMessages([]);
  };

  const handleExport = () => {
    const data = JSON.stringify(messages, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solace-messages-${Date.now()}.json`;
    a.click();
  };

  const addSystemMessage = (text: string) => {
    const msg: SolaceMessage = {
      id: `sys-${Date.now()}`,
      topic: 'SYSTEM',
      payload: { message: text },
      timestamp: Date.now(),
      messageType: 'other'
    };
    setMessages(prev => [...prev, msg]);
  };

  const getMessageColor = (type: SolaceMessage['messageType']) => {
    switch (type) {
      case 'question': return 'bg-millionaire-blue/20 border-millionaire-blue';
      case 'answer': return 'bg-green-900/30 border-green-500';
      case 'score': return 'bg-millionaire-purple/30 border-millionaire-purple-light';
      case 'leaderboard': return 'bg-millionaire-gold/20 border-millionaire-gold';
      case 'control': return 'bg-red-900/30 border-red-500';
      case 'player': return 'bg-indigo-900/30 border-indigo-400';
      default: return 'bg-millionaire-dark-light border-gray-600';
    }
  };

  return (
    <motion.div
      ref={panelRef}
      initial={{ width: 0 }}
      animate={{ width: width }}
      exit={{ width: 0 }}
      className="h-screen bg-millionaire-dark border-l-4 border-millionaire-gold shadow-2xl flex flex-shrink-0"
      style={{ minWidth: width }}
    >
      {/* Resize Handle */}
      <div
        className="w-2 bg-millionaire-navy-dark hover:bg-millionaire-gold cursor-ew-resize flex-shrink-0 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Panel Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header - Compact with just title and connection status */}
        <div className="text-white p-3 flex-shrink-0 border-b border-millionaire-gold/30 bg-millionaire-navy-dark">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xl">📡</span>
              <h3 className="text-base font-bold">Solace Message Viewer</h3>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-2 py-1 rounded bg-millionaire-dark-light">
                <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                <span className="text-xs text-gray-300">{connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-millionaire-gold text-2xl leading-none"
              >
                ×
              </button>
            </div>
          </div>

          {/* Active Subscription Badge */}
          {activeSubscription && (
            <div className="mt-2 bg-millionaire-gold text-millionaire-dark px-3 py-2 rounded text-sm font-mono">
              <div className="text-xs opacity-75 mb-1">Subscribed to:</div>
              <div className="break-all">{activeSubscription}</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="bg-millionaire-dark-light p-4 border-b border-millionaire-gold/30 flex-shrink-0">
          <div className="flex space-x-2 mb-3">
            <button
              onClick={() => setIsPaused(!isPaused)}
              className="px-3 py-2 bg-millionaire-gold hover:bg-millionaire-gold-light text-millionaire-dark rounded text-sm font-semibold transition-colors"
            >
              {isPaused ? '▶️ Resume' : '⏸️ Pause'}
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-2 bg-millionaire-purple hover:bg-millionaire-purple-light text-white rounded text-sm transition-colors"
            >
              🗑️ Clear
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-2 bg-millionaire-purple hover:bg-millionaire-purple-light text-white rounded text-sm transition-colors"
            >
              💾 Export
            </button>
          </div>

          {/* Subscription Controls */}
          <div className="space-y-2">
            <select
              value={selectedPattern}
              onChange={(e) => {
                setSelectedPattern(e.target.value);
                setCustomPattern('');
              }}
              className="w-full px-3 py-2 border border-millionaire-gold/30 bg-millionaire-dark text-white rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-sm"
            >
              <option value="">Select preset pattern...</option>
              {PRESET_SUBSCRIPTIONS.map((sub, idx) => (
                <option key={idx} value={sub.pattern}>
                  {sub.description}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={customPattern}
              onChange={(e) => {
                setCustomPattern(e.target.value);
                setSelectedPattern('');
              }}
              placeholder="Or enter custom topic (e.g., trivia/session/*/question)"
              className="w-full px-3 py-2 border border-millionaire-gold/30 bg-millionaire-dark text-white rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-sm font-mono placeholder-gray-500"
            />

            <button
              onClick={handleSubscribe}
              disabled={!customPattern && !selectedPattern}
              className="w-full px-4 py-2 bg-millionaire-gold hover:bg-millionaire-gold-light disabled:bg-gray-700 disabled:cursor-not-allowed text-millionaire-dark disabled:text-gray-400 rounded font-semibold transition-colors"
            >
              Subscribe to Topic
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-400 bg-millionaire-dark p-2 rounded border border-millionaire-gold/20">
            <strong className="text-millionaire-gold">Wildcards:</strong> <code className="bg-millionaire-navy-dark px-1 rounded text-white">*</code> = single level, 
            <code className="bg-millionaire-navy-dark px-1 rounded ml-1 text-white">{'>'}</code> = multi-level
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 bg-millionaire-dark">
          {messages.length === 0 ? (
            <div className="text-center text-gray-400 py-12">
              <div className="text-4xl mb-4">📭</div>
              <p className="text-lg font-semibold mb-2 text-white">No messages yet</p>
              <p className="text-sm">Subscribe to a topic to see live Solace events</p>
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 border-l-4 rounded ${getMessageColor(msg.messageType)}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-mono text-xs text-millionaire-gold flex-1 break-all">
                      {msg.topic}
                    </div>
                    <div className="text-xs text-gray-400 ml-2 flex-shrink-0">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <pre className="text-xs overflow-x-auto bg-millionaire-dark-light text-gray-200 p-2 rounded border border-millionaire-gold/20">
                    {JSON.stringify(msg.payload, null, 2)}
                  </pre>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
