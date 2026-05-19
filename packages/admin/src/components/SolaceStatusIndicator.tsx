import { useState, useEffect } from 'react';
import { useSolace } from '../hooks/useSolace';

export default function SolaceStatusIndicator() {
  const { connected, config } = useSolace();
  const [showDetails, setShowDetails] = useState(false);
  const [lastConnected, setLastConnected] = useState<Date | null>(null);
  const [lastDisconnected, setLastDisconnected] = useState<Date | null>(null);

  useEffect(() => {
    if (connected) {
      setLastConnected(new Date());
    } else {
      setLastDisconnected(new Date());
    }
  }, [connected]);

  const formatTime = (date: Date | null) => {
    if (!date) return 'N/A';
    return date.toLocaleTimeString();
  };

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowDetails(true)}
      onMouseLeave={() => setShowDetails(false)}
    >
      {/* Main Status Badge */}
      <div className={`
        flex items-center gap-2.5 px-4 py-2 rounded-full cursor-pointer transition-all duration-300
        border-2 backdrop-blur-sm
        ${connected 
          ? 'bg-green-500/10 border-green-500/50 hover:bg-green-500/20 hover:border-green-500' 
          : 'bg-red-500/10 border-red-500/50 hover:bg-red-500/20 hover:border-red-500 animate-pulse'
        }
      `}>
        {/* Status Dot with glow effect */}
        <div className="relative">
          <span className={`
            inline-block w-2.5 h-2.5 rounded-full transition-all
            ${connected ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]' : 'bg-red-400 shadow-[0_0_8px_rgba(248,113,113,0.8)]'}
          `}></span>
          {connected && (
            <span className="absolute inset-0 w-2.5 h-2.5 rounded-full bg-green-400 animate-ping opacity-75"></span>
          )}
        </div>
        
        {/* Text */}
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${connected ? 'text-green-400' : 'text-red-400'}`}>
            Solace
          </span>
          <span className="text-xs text-gray-400">|</span>
          <span className={`text-xs font-medium ${connected ? 'text-green-300' : 'text-red-300'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Detailed Tooltip */}
      {showDetails && (
        <div className="absolute top-full right-0 mt-3 w-72 bg-gradient-to-br from-millionaire-dark to-gray-900 border-2 border-millionaire-gold/60 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden z-50">
          {/* Header with gradient */}
          <div className="bg-gradient-to-r from-millionaire-gold/20 to-transparent px-4 py-3 border-b border-millionaire-gold/30">
            <div className="font-bold text-millionaire-gold flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Connection Details
            </div>
          </div>
          
          {/* Content */}
          <div className="p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
              <span className="text-gray-400 font-medium">Status</span>
              <span className={`font-bold flex items-center gap-1.5 ${connected ? 'text-green-400' : 'text-red-400'}`}>
                {connected ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Online
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Offline
                  </>
                )}
              </span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Broker</span>
              <span className="text-gray-200 font-mono text-xs">{config?.url || 'Not configured'}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-gray-400">VPN</span>
              <span className="text-gray-200 font-semibold">{config?.vpnName || 'Not configured'}</span>
            </div>
            
            {lastConnected && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Last Connected</span>
                <span className="text-green-300 font-medium">{formatTime(lastConnected)}</span>
              </div>
            )}
            
            {!connected && lastDisconnected && (
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Disconnected At</span>
                <span className="text-red-300 font-medium">{formatTime(lastDisconnected)}</span>
              </div>
            )}
          </div>
          
          {/* Warning Footer (only when disconnected) */}
          {!connected && (
            <div className="bg-red-500/10 border-t border-red-500/30 px-4 py-3">
              <div className="flex items-start gap-2">
                <svg className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <div className="text-red-300 font-semibold text-xs">Real-time features unavailable</div>
                  <div className="text-gray-400 text-xs mt-1">Check if Solace broker is running</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
