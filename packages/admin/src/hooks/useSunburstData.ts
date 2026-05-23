import { useState, useEffect, useRef, useCallback } from 'react';
import { useSolace } from './useSolace';
import {
  TopicTreeNode,
  SunburstMetrics,
  SunburstDisplayOptions,
  SunburstConnectionStatus,
  createTopicTreeRoot,
  addMessageToTopicTree,
  recalculateUniqueTopics,
  topicTreeToD3Hierarchy,
} from '@trivia-millionaire/shared';

interface UseSunburstDataOptions {
  sessionId?: string;
  autoSubscribe?: boolean;
  refreshInterval?: number; // ms between display refreshes
}

interface UseSunburstDataReturn {
  // Connection state
  connectionStatus: SunburstConnectionStatus;
  
  // Data
  topicTree: TopicTreeNode;
  d3Hierarchy: any;
  metrics: SunburstMetrics;
  
  // Display options
  displayOptions: SunburstDisplayOptions;
  setDisplayOptions: (options: Partial<SunburstDisplayOptions>) => void;
  
  // Controls
  isScanning: boolean;
  startScanning: (topicPattern?: string) => void;
  stopScanning: () => void;
  clear: () => void;
  
  // Drill-down navigation
  currentPath: string;
  drillDown: (path: string) => void;
  drillUp: () => void;
  resetView: () => void;
}

const DEFAULT_DISPLAY_OPTIONS: SunburstDisplayOptions = {
  detailLevel: 3,
  maxElementsPerLevel: 8,
  viewBy: 'balanced',
  sortBy: 'messages',
  sortDirection: 'desc',
  accurateOthersSize: false,
};

const DEFAULT_TOPIC_PATTERN = '#noexport/>';

export function useSunburstData(options: UseSunburstDataOptions = {}): UseSunburstDataReturn {
  const { sessionId, autoSubscribe = false, refreshInterval = 3000 } = options;
  
  // Solace connection
  const { connected, subscribe } = useSolace();
  
  // State
  const [topicTree, setTopicTree] = useState<TopicTreeNode>(createTopicTreeRoot());
  const [metrics, setMetrics] = useState<SunburstMetrics>({
    currentMessageRate: 0,
    totalMessagesReceived: 0,
    uniqueTopicsReceived: 0,
    lastUpdateTime: Date.now(),
  });
  const [displayOptions, setDisplayOptionsState] = useState<SunburstDisplayOptions>(DEFAULT_DISPLAY_OPTIONS);
  const [isScanning, setIsScanning] = useState(false);
  const [currentPath, setCurrentPath] = useState('');
  const [d3Hierarchy, setD3Hierarchy] = useState<any>(null);
  
  // Refs for mutable state in callbacks
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const messageCountRef = useRef(0);
  const lastRateCalcRef = useRef(Date.now());
  const messagesSinceLastCalcRef = useRef(0);
  const treeRef = useRef<TopicTreeNode>(topicTree);
  
  // Keep tree ref in sync
  useEffect(() => {
    treeRef.current = topicTree;
  }, [topicTree]);
  
  // Connection status
  const connectionStatus: SunburstConnectionStatus = !connected 
    ? 'disconnected' 
    : isScanning 
      ? 'scanning' 
      : 'paused';
  
  // Handle incoming messages
  const handleMessage = useCallback((message: { topic: string; payload: any; timestamp: number }) => {
    const payloadSize = JSON.stringify(message.payload).length;
    
    // Update tree (mutates in place for performance)
    addMessageToTopicTree(
      treeRef.current,
      message.topic,
      payloadSize,
      message.timestamp
    );
    
    // Update counters
    messageCountRef.current++;
    messagesSinceLastCalcRef.current++;
    
    // Force re-render by creating new object reference
    // Note: We don't deep-clone for performance; the refresh interval will pick up changes
  }, []);
  
  // Refresh D3 hierarchy periodically
  useEffect(() => {
    if (!isScanning) return;
    
    const refresh = () => {
      // Recalculate unique topics
      recalculateUniqueTopics(treeRef.current);
      
      // Find the node to display based on currentPath
      let displayNode = treeRef.current;
      if (currentPath) {
        const pathParts = currentPath.split('/').filter(p => p);
        for (const part of pathParts) {
          const child = displayNode.children.get(part);
          if (child) {
            displayNode = child;
          } else {
            break;
          }
        }
      }
      
      // Convert to D3 hierarchy
      const hierarchy = topicTreeToD3Hierarchy(displayNode, displayOptions);
      setD3Hierarchy(hierarchy);
      
      // Calculate message rate
      const now = Date.now();
      const elapsed = (now - lastRateCalcRef.current) / 1000;
      const rate = elapsed > 0 ? messagesSinceLastCalcRef.current / elapsed : 0;
      
      setMetrics({
        currentMessageRate: Math.round(rate * 10) / 10,
        totalMessagesReceived: messageCountRef.current,
        uniqueTopicsReceived: treeRef.current.uniqueTopics,
        lastUpdateTime: now,
      });
      
      lastRateCalcRef.current = now;
      messagesSinceLastCalcRef.current = 0;
    };
    
    // Initial refresh
    refresh();
    
    // Set up interval
    const interval = setInterval(refresh, refreshInterval);
    
    return () => clearInterval(interval);
  }, [isScanning, displayOptions, currentPath, refreshInterval]);
  
  // Start scanning
  const startScanning = useCallback((topicPattern?: string) => {
    if (!connected) return;
    
    // Determine topic pattern
    let pattern = topicPattern || DEFAULT_TOPIC_PATTERN;
    if (sessionId && !topicPattern) {
      pattern = `trivia/session/${sessionId}/>`;
    }
    
    // Unsubscribe from previous
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
    }
    
    // Subscribe
    const unsub = subscribe(pattern, handleMessage);
    unsubscribeRef.current = unsub;
    setIsScanning(true);
  }, [connected, sessionId, subscribe, handleMessage]);
  
  // Stop scanning
  const stopScanning = useCallback(() => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    setIsScanning(false);
  }, []);
  
  // Clear data
  const clear = useCallback(() => {
    // Stop scanning
    stopScanning();
    
    // Reset state
    const newTree = createTopicTreeRoot();
    setTopicTree(newTree);
    treeRef.current = newTree;
    setD3Hierarchy(null);
    setCurrentPath('');
    messageCountRef.current = 0;
    messagesSinceLastCalcRef.current = 0;
    lastRateCalcRef.current = Date.now();
    
    setMetrics({
      currentMessageRate: 0,
      totalMessagesReceived: 0,
      uniqueTopicsReceived: 0,
      lastUpdateTime: Date.now(),
    });
    
    // Don't auto-restart - let user manually restart
  }, [isScanning, stopScanning]);
  
  // Update display options
  const setDisplayOptions = useCallback((newOptions: Partial<SunburstDisplayOptions>) => {
    setDisplayOptionsState(prev => ({ ...prev, ...newOptions }));
  }, []);
  
  // Drill-down navigation
  const drillDown = useCallback((path: string) => {
    setCurrentPath(path);
  }, []);
  
  const drillUp = useCallback(() => {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(p => p);
    parts.pop();
    setCurrentPath(parts.join('/'));
  }, [currentPath]);
  
  const resetView = useCallback(() => {
    setCurrentPath('');
  }, []);
  
  // Auto-subscribe on mount if enabled
  useEffect(() => {
    if (autoSubscribe && connected && !isScanning) {
      startScanning();
    }
    
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSubscribe, connected]);
  
  return {
    connectionStatus,
    topicTree,
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
  };
}
