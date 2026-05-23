import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useSunburstData } from '../hooks/useSunburstData';
import SunburstVisualization from './SunburstVisualization';
import { SUNBURST_COLORS } from '@trivia-millionaire/shared';

interface SolaceSunburstPanelProps {
  sessionId: string;
  onClose: () => void;
}

export default function SolaceSunburstPanel({ sessionId, onClose }: SolaceSunburstPanelProps) {
  const [width, setWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  
  const {
    connectionStatus,
    d3Hierarchy,
    metrics,
    displayOptions,
    setDisplayOptions,
    isScanning,
    startScanning,
    stopScanning,
    clear,
    currentPath,
    drillDown,
    drillUp,
    resetView,
  } = useSunburstData({ sessionId });
  
  // Handle resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = window.innerWidth - e.clientX;
      setWidth(Math.max(400, Math.min(newWidth, window.innerWidth - 200)));
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
  
  // Status bar color based on connection status
  const statusColor = SUNBURST_COLORS.status[connectionStatus];
  const statusText = {
    disconnected: 'Disconnected',
    connecting: 'Connecting...',
    paused: 'Connected (Paused)',
    scanning: 'Scanning',
  }[connectionStatus];
  
  // Export data as JSON
  const handleExport = () => {
    const exportData = {
      metrics,
      currentPath,
      displayOptions,
      timestamp: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sunburst-data-${Date.now()}.json`;
    a.click();
  };
  
  // Calculate visualization size
  const vizSize = Math.min(width - 48, 500);
  
  return (
    <motion.div
      ref={panelRef}
      initial={{ width: 0 }}
      animate={{ width }}
      exit={{ width: 0 }}
      className="h-screen bg-gray-900 border-l-4 shadow-2xl flex flex-shrink-0"
      style={{ 
        minWidth: width, 
        borderColor: statusColor,
      }}
    >
      {/* Resize Handle */}
      <div
        className="w-2 bg-gray-800 hover:bg-green-600 cursor-ew-resize flex-shrink-0 transition-colors"
        onMouseDown={() => setIsResizing(true)}
      />

      {/* Panel Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Status Bar */}
        <motion.div 
          className="h-1 w-full"
          style={{ backgroundColor: statusColor }}
          animate={{ 
            opacity: connectionStatus === 'scanning' ? [0.5, 1, 0.5] : 1 
          }}
          transition={{ 
            duration: 1.5, 
            repeat: connectionStatus === 'scanning' ? Infinity : 0 
          }}
        />
        
        {/* Header */}
        <div className="text-white p-3 flex-shrink-0 border-b border-gray-700 bg-gray-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="text-xl">🌐</span>
              <h3 className="text-base font-bold">Sunburst Topic Explorer</h3>
            </div>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 px-2 py-1 rounded bg-gray-700">
                <span 
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ backgroundColor: statusColor }}
                />
                <span className="text-xs text-gray-300">{statusText}</span>
              </div>
              <button
                onClick={onClose}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          {/* Current Path Breadcrumb */}
          {currentPath && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <button 
                onClick={resetView}
                className="text-green-400 hover:text-green-300"
              >
                root
              </button>
              {currentPath.split('/').filter(p => p).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-2">
                  <span className="text-gray-500">/</span>
                  {i === arr.length - 1 ? (
                    <span className="text-white font-mono">{part}</span>
                  ) : (
                    <button 
                      onClick={() => drillDown(arr.slice(0, i + 1).join('/'))}
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

        {/* Real-time Metrics */}
        <div className="bg-gray-800/50 p-3 border-b border-gray-700 flex-shrink-0">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-400 mb-1">Message Rate</div>
              <div className="text-lg font-bold text-green-400">
                {metrics.currentMessageRate.toFixed(1)} <span className="text-xs text-gray-500">msg/s</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Total Messages</div>
              <div className="text-lg font-bold text-white">
                {metrics.totalMessagesReceived.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Unique Topics</div>
              <div className="text-lg font-bold text-blue-400">
                {metrics.uniqueTopicsReceived.toLocaleString()}
              </div>
            </div>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="bg-gray-800 p-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Play/Pause */}
            <button
              onClick={() => isScanning ? stopScanning() : startScanning()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                isScanning 
                  ? 'bg-yellow-600 hover:bg-yellow-500 text-white' 
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {isScanning ? (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Start
                </>
              )}
            </button>
            
            {/* Clear */}
            <button
              onClick={clear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
            
            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export
            </button>
          </div>
        </div>

        {/* Display Options */}
        <div className="bg-gray-800/30 p-3 border-b border-gray-700 flex-shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            {/* Max Elements */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Max per level:</label>
              <select
                value={displayOptions.maxElementsPerLevel}
                onChange={(e) => setDisplayOptions({ maxElementsPerLevel: Number(e.target.value) })}
                className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
              >
                {[5, 8, 10, 15, 20, 30].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            
            {/* View By */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">View by:</label>
              <select
                value={displayOptions.viewBy}
                onChange={(e) => setDisplayOptions({ viewBy: e.target.value as any })}
                className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
              >
                <option value="balanced">Balanced</option>
                <option value="messages"># Messages</option>
                <option value="bytes"># Bytes</option>
                <option value="topics"># Topics</option>
              </select>
            </div>
            
            {/* Sort By */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-400">Sort:</label>
              <select
                value={displayOptions.sortBy}
                onChange={(e) => setDisplayOptions({ sortBy: e.target.value as any })}
                className="bg-gray-700 text-white text-xs rounded px-2 py-1 border border-gray-600"
              >
                <option value="messages">Messages</option>
                <option value="bytes">Bytes</option>
                <option value="topics">Topics</option>
                <option value="busyTopics">Busy Topics</option>
                <option value="lastArrival">Last Arrival</option>
                <option value="name">Name</option>
              </select>
              <button
                onClick={() => setDisplayOptions({ 
                  sortDirection: displayOptions.sortDirection === 'desc' ? 'asc' : 'desc' 
                })}
                className="p-1 rounded bg-gray-700 hover:bg-gray-600 text-white"
                title={`Sort ${displayOptions.sortDirection === 'desc' ? 'ascending' : 'descending'}`}
              >
                {displayOptions.sortDirection === 'desc' ? '↓' : '↑'}
              </button>
            </div>
          </div>
        </div>

        {/* Sunburst Visualization */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-900">
          <SunburstVisualization
            data={d3Hierarchy}
            width={vizSize}
            height={vizSize}
            onNodeClick={drillDown}
            onCenterClick={drillUp}
            currentPath={currentPath}
            viewBy={displayOptions.viewBy}
          />
        </div>

        {/* Footer with subscription info */}
        <div className="bg-gray-800 p-2 border-t border-gray-700 flex-shrink-0">
          <div className="text-xs text-gray-500 text-center">
            Subscribing to: <span className="font-mono text-gray-400">trivia/session/{sessionId}/&gt;</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
