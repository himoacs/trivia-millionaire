import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { PRESET_SUBSCRIPTIONS, SolaceMessage, getMessageTypeFromTopic, replaceTopicPlaceholder } from '@trivia-millionaire/shared';
import { useSolace } from '../hooks/useSolace';
import { useSunburstData } from '../hooks/useSunburstData';
import SunburstVisualization from './SunburstVisualization';

type ViewMode = 'list' | 'sunburst';

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
  
  // Sunburst topic pattern state
  const [sunburstSelectedPattern, setSunburstSelectedPattern] = useState('');
  const [sunburstCustomPattern, setSunburstCustomPattern] = useState('');
  const [activeSunburstPattern, setActiveSunburstPattern] = useState<string>('');
  
  // Persist view mode across remounts
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem('solace-debug-viewMode');
    return (saved === 'sunburst' || saved === 'list') ? saved : 'list';
  });
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Connect to Solace
  const { connected, subscribe } = useSolace();
  
  // Sunburst data hook
  const sunburstData = useSunburstData({ sessionId });

  useEffect(() => {
    // Auto-scroll to bottom when new messages arrive
    if (!isPaused) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isPaused]);

  // Auto-subscribe to all session messages when connected
  useEffect(() => {
    if (connected && sessionId && !activeSubscription) {
      // Auto-subscribe to all session events
      const defaultPattern = `trivia/session/${sessionId}/>`;
      setActiveSubscription(defaultPattern);
      
      const unsub = subscribe(defaultPattern, (message) => {
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
      
      // Add system message inline to avoid dependency issues
      const sysMsg: SolaceMessage = {
        id: `sys-${Date.now()}`,
        topic: 'SYSTEM',
        payload: { message: `✅ Auto-subscribed to: ${defaultPattern}` },
        timestamp: Date.now(),
        messageType: 'other'
      };
      setMessages(prev => [...prev, sysMsg]);
    }
  }, [connected, sessionId, activeSubscription, subscribe]);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeFn) {
        unsubscribeFn();
      }
    };
  }, [unsubscribeFn]);

  // Persist viewMode to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('solace-debug-viewMode', viewMode);
  }, [viewMode]);

  // Persist sunburst scanning state and pattern
  useEffect(() => {
    localStorage.setItem(`solace-sunburst-scanning-${sessionId}`, sunburstData.isScanning.toString());
  }, [sunburstData.isScanning, sessionId]);
  
  useEffect(() => {
    if (activeSunburstPattern) {
      localStorage.setItem(`solace-sunburst-pattern-${sessionId}`, activeSunburstPattern);
    }
  }, [activeSunburstPattern, sessionId]);

  // Auto-start in sunburst mode with saved or default pattern
  useEffect(() => {
    const savedPattern = localStorage.getItem(`solace-sunburst-pattern-${sessionId}`);
    
    if (viewMode === 'sunburst' && connected && !sunburstData.isScanning) {
      // Auto-start with saved pattern or default
      const timer = setTimeout(() => {
        const pattern = savedPattern || `trivia/session/${sessionId}/>`;
        sunburstData.startScanning(pattern);
        setActiveSunburstPattern(pattern);
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [connected, sessionId, viewMode]); // Auto-start when switching to sunburst or on connect

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
  
  const handleSunburstSubscribe = () => {
    const pattern = sunburstCustomPattern || sunburstSelectedPattern;
    if (!pattern) return;

    const finalPattern = replaceTopicPlaceholder(pattern, sessionId);
    setActiveSunburstPattern(finalPattern);
    
    // Stop current scanning and restart with new pattern
    sunburstData.stopScanning();
    setTimeout(() => {
      sunburstData.startScanning(finalPattern);
    }, 100);
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
              <span className="text-xl">{viewMode === 'list' ? '📡' : '🌐'}</span>
              <h3 className="text-base font-bold">Solace Message Viewer</h3>
            </div>
            <div className="flex items-center space-x-3">
              {/* View Toggle */}
              <div className="flex rounded-lg overflow-hidden border border-millionaire-gold/30">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-2 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'list'
                      ? 'bg-millionaire-gold text-millionaire-dark'
                      : 'bg-millionaire-dark-light text-gray-300 hover:bg-millionaire-dark'
                  }`}
                  title="List View"
                >
                  📋 List
                </button>
                <button
                  onClick={() => setViewMode('sunburst')}
                  className={`px-2 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'sunburst'
                      ? 'bg-millionaire-gold text-millionaire-dark'
                      : 'bg-millionaire-dark-light text-gray-300 hover:bg-millionaire-dark'
                  }`}
                  title="Sunburst View"
                >
                  🌐 Sunburst
                </button>
              </div>
              <div className="flex items-center space-x-2 px-2 py-1 rounded bg-millionaire-dark-light">
                <span className={`inline-block w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                <span className="text-xs text-gray-300">{connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              <button
                onClick={onClose}
                className="btn-icon-ghost btn-icon-sm"
                title="Close debug panel"
                aria-label="Close debug panel"
              >
                ×
              </button>
            </div>
          </div>

          {/* Active Subscription Badge - Only show in list view */}
          {viewMode === 'list' && activeSubscription && (
            <div className="mt-2 bg-millionaire-gold text-millionaire-dark px-3 py-2 rounded text-sm font-mono">
              <div className="text-xs opacity-75 mb-1">Subscribed to:</div>
              <div className="break-all">{activeSubscription}</div>
            </div>
          )}
          
          {/* Active Subscription or Path - Only show in sunburst view */}
          {viewMode === 'sunburst' && (
            <div className="mt-2">
              {activeSunburstPattern && (
                <div className="bg-millionaire-gold text-millionaire-dark px-3 py-2 rounded text-sm font-mono mb-2">
                  <div className="text-xs opacity-75 mb-1">Subscribed to:</div>
                  <div className="break-all">{activeSunburstPattern}</div>
                </div>
              )}
              {sunburstData.currentPath && (
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <button 
                    onClick={sunburstData.resetView}
                    className="text-green-400 hover:text-green-300"
                  >
                    root
                  </button>
                  {sunburstData.currentPath.split('/').filter((p: string) => p).map((part: string, i: number, arr: string[]) => (
                    <span key={i} className="flex items-center gap-2">
                      <span className="text-gray-500">/</span>
                      {i === arr.length - 1 ? (
                        <span className="text-white font-mono">{part}</span>
                      ) : (
                        <button 
                          onClick={() => sunburstData.drillDown(arr.slice(0, i + 1).join('/'))}
                          className="text-green-400 hover:text-green-300 font-mono"
                        >
                          {part}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Controls - Different for each view mode */}
        {viewMode === 'list' ? (
          <>
            <div className="bg-millionaire-dark-light p-4 border-b border-millionaire-gold/30 flex-shrink-0">
              <div className="flex space-x-2 mb-3">
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="btn-tertiary btn-sm"
                  title={isPaused ? 'Resume message stream' : 'Pause message stream'}
                  aria-pressed={isPaused}
                >
                  {isPaused ? '▶️ Resume' : '⏸️ Pause'}
                </button>
                <button
                  onClick={handleClear}
                  className="btn-ghost btn-sm"
                  title="Clear all messages"
                >
                  🗑️ Clear
                </button>
                <button
                  onClick={handleExport}
                  className="btn-ghost btn-sm"
                  title="Export messages as JSON"
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
                  className="w-full px-3 py-2 border-2 border-blue-500/60 bg-blue-900/30 text-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-medium hover:bg-blue-900/40"
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
                  className="w-full px-3 py-2 border-2 border-blue-500/60 bg-blue-900/30 text-blue-200 rounded focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm font-mono placeholder-gray-400 hover:bg-blue-900/40"
                />
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
          </>
        ) : (
          <>
            {/* Sunburst View Controls */}
            <div className="bg-millionaire-dark-light p-3 border-b border-millionaire-gold/30 flex-shrink-0">
              {/* Subscription Controls */}
              <div className="space-y-2 mb-3">
                <select
                  value={sunburstSelectedPattern}
                  onChange={(e) => {
                    setSunburstSelectedPattern(e.target.value);
                    setSunburstCustomPattern('');
                  }}
                  className="w-full px-2 py-1.5 border border-millionaire-gold/30 bg-millionaire-dark text-white rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-xs"
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
                  value={sunburstCustomPattern}
                  onChange={(e) => {
                    setSunburstCustomPattern(e.target.value);
                    setSunburstSelectedPattern('');
                  }}
                  placeholder="Or custom topic (e.g., trivia/session/*/question)"
                  className="w-full px-2 py-1.5 border border-millionaire-gold/30 bg-millionaire-dark text-white rounded focus:outline-none focus:ring-2 focus:ring-millionaire-gold text-xs font-mono placeholder-gray-500"
                />

                <button
                  onClick={handleSunburstSubscribe}
                  disabled={!sunburstCustomPattern && !sunburstSelectedPattern}
                  className="w-full px-3 py-1.5 bg-millionaire-gold hover:bg-millionaire-gold-light disabled:bg-gray-700 disabled:cursor-not-allowed text-millionaire-dark disabled:text-gray-400 rounded font-semibold transition-colors text-xs"
                >
                  Subscribe to Topic
                </button>
              </div>
              
              {/* Real-time Metrics */}
              <div className="grid grid-cols-3 gap-4 text-center mb-3">
                <div>
                  <div className="text-xs text-gray-400 mb-1">Message Rate</div>
                  <div className="text-lg font-bold text-green-400">
                    {sunburstData.metrics.currentMessageRate.toFixed(1)} <span className="text-xs text-gray-500">msg/s</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Total Messages</div>
                  <div className="text-lg font-bold text-white">
                    {sunburstData.metrics.totalMessagesReceived.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 mb-1">Unique Topics</div>
                  <div className="text-lg font-bold text-blue-400">
                    {sunburstData.metrics.uniqueTopicsReceived.toLocaleString()}
                  </div>
                </div>
              </div>
              
              {/* Control Buttons */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => {
                    if (sunburstData.isScanning) {
                      sunburstData.stopScanning();
                    } else {
                      const pattern = activeSunburstPattern || `trivia/session/${sessionId}/>`;
                      sunburstData.startScanning(pattern);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    sunburstData.isScanning 
                      ? 'bg-yellow-600 hover:bg-yellow-500 text-white' 
                      : 'bg-green-600 hover:bg-green-500 text-white'
                  }`}
                >
                  {sunburstData.isScanning ? '⏸️ Stop' : '▶️ Start'}
                </button>
                
                <button
                  onClick={sunburstData.clear}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
                >
                  🗑️ Clear
                </button>
              </div>
              
              {/* Display Options */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">Max per level:</label>
                  <select
                    value={sunburstData.displayOptions.maxElementsPerLevel}
                    onChange={(e) => sunburstData.setDisplayOptions({ maxElementsPerLevel: Number(e.target.value) })}
                    className="bg-blue-900/30 text-blue-200 text-xs rounded px-2 py-1 border-2 border-blue-500/60 font-medium hover:bg-blue-900/40"
                  >
                    {[5, 8, 10, 15, 20].map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">View by:</label>
                  <select
                    value={sunburstData.displayOptions.viewBy}
                    onChange={(e) => sunburstData.setDisplayOptions({ viewBy: e.target.value as any })}
                    className="bg-blue-900/30 text-blue-200 text-xs rounded px-2 py-1 border-2 border-blue-500/60 font-medium hover:bg-blue-900/40"
                  >
                    <option value="balanced">Balanced</option>
                    <option value="messages"># Messages</option>
                    <option value="bytes"># Bytes</option>
                    <option value="topics"># Topics</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <label className="text-xs text-gray-400">Sort:</label>
                  <select
                    value={sunburstData.displayOptions.sortBy}
                    onChange={(e) => sunburstData.setDisplayOptions({ sortBy: e.target.value as any })}
                    className="bg-blue-900/30 text-blue-200 text-xs rounded px-2 py-1 border-2 border-blue-500/60 font-medium hover:bg-blue-900/40"
                  >
                    <option value="messages">Messages</option>
                    <option value="bytes">Bytes</option>
                    <option value="topics">Topics</option>
                    <option value="lastArrival">Last Arrival</option>
                    <option value="name">Name</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Sunburst Visualization */}
            <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-millionaire-dark">
              <SunburstVisualization
                data={sunburstData.d3Hierarchy}
                width={Math.min(width - 48, 450)}
                height={Math.min(width - 48, 450)}
                onNodeClick={sunburstData.drillDown}
                onCenterClick={sunburstData.drillUp}
                currentPath={sunburstData.currentPath}
                viewBy={sunburstData.displayOptions.viewBy}
              />
            </div>
            
            {/* Footer with help text */}
            <div className="bg-millionaire-dark-light p-2 border-t border-millionaire-gold/30 flex-shrink-0">
              <div className="text-xs text-gray-400 text-center">
                💡 Click segments to drill down • Click center to go back up
              </div>
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}
