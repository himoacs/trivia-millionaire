import { useEffect, useRef, useState, useCallback } from 'react';
import solace from 'solclientjs';

interface SolaceConfig {
  url: string;
  vpnName: string;
  username: string;
  password: string;
}

interface SolaceMessage {
  topic: string;
  payload: any;
  timestamp: number;
}

type MessageCallback = (message: SolaceMessage) => void;

const MAX_RECONNECT_DELAY_MS = 30_000;

export function useSolace(config?: SolaceConfig) {
  const [connected, setConnected] = useState(false);
  const sessionRef = useRef<solace.Session | null>(null);
  const subscribersRef = useRef<Map<string, MessageCallback[]>>(new Map());
  const initRef = useRef(false);

  const defaultConfig: SolaceConfig = {
    url: import.meta.env.VITE_SOLACE_BROKER_URL || 'ws://localhost:8008',
    vpnName: import.meta.env.VITE_SOLACE_VPN_NAME || 'default',
    username: import.meta.env.VITE_SOLACE_USERNAME || 'default',
    password: import.meta.env.VITE_SOLACE_PASSWORD || 'default'
  };

  const solaceConfig = config || defaultConfig;

  useEffect(() => {
    // Initialize Solace factory only once globally
    if (!initRef.current) {
      try {
        const factoryProps = new solace.SolclientFactoryProperties();
        factoryProps.profile = solace.SolclientFactoryProfiles.version10;
        solace.SolclientFactory.init(factoryProps);
        initRef.current = true;
      } catch (error) {
        console.error('Solace factory already initialized or error:', error);
      }
    }

    const sessionProperties: any = {
      url: solaceConfig.url,
      vpnName: solaceConfig.vpnName,
      userName: solaceConfig.username,
      password: solaceConfig.password
    };

    let isUnmounted = false;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempt = 0;

    const disposeSession = (session: solace.Session | null) => {
      if (!session) return;
      try { session.disconnect(); } catch { /* ignore */ }
      try { session.dispose(); } catch { /* ignore */ }
    };

    const scheduleReconnect = () => {
      if (isUnmounted || reconnectTimeout) return;
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), MAX_RECONNECT_DELAY_MS);
      reconnectAttempt += 1;
      console.log(`🔄 [Admin] Reconnecting in ${delay}ms (attempt ${reconnectAttempt})`);
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null;
        createAndConnect();
      }, delay);
    };

    const createAndConnect = () => {
      if (isUnmounted) return;

      // Clear stale session before creating a new one. Null out sessionRef first
      // so that any DISCONNECTED event fired during teardown is ignored by
      // the stale-handler check below.
      const old = sessionRef.current;
      sessionRef.current = null;
      disposeSession(old);

      let session: solace.Session;
      try {
        session = solace.SolclientFactory.createSession(sessionProperties);
      } catch (error) {
        console.error('Error creating Solace session:', error);
        scheduleReconnect();
        return;
      }
      sessionRef.current = session;

      session.on(solace.SessionEventCode.UP_NOTICE, () => {
        if (sessionRef.current !== session) return;
        console.log('✅ [Admin] Connected to Solace broker');
        reconnectAttempt = 0;
        setConnected(true);
      });

      session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (error) => {
        if (sessionRef.current !== session) return;
        console.error('❌ [Admin] Connection failed:', error);
        setConnected(false);
        scheduleReconnect();
      });

      session.on(solace.SessionEventCode.DISCONNECTED, () => {
        if (sessionRef.current !== session) return;
        console.log('🔌 [Admin] Disconnected from Solace broker');
        setConnected(false);
        scheduleReconnect();
      });

      session.on(solace.SessionEventCode.SUBSCRIPTION_ERROR, (error) => {
        console.error('⚠️ [Admin] Subscription error:', error);
      });

      session.on(solace.SessionEventCode.SUBSCRIPTION_OK, (event) => {
        console.log('📥 [Admin] Subscription confirmed:', event.correlationKey);
      });

      session.on(solace.SessionEventCode.MESSAGE, (message: solace.Message) => {
        const topic = message.getDestination()?.getName() || '';
        const payloadText = message.getBinaryAttachment();

        try {
          let payload = {};
          if (payloadText) {
            const text = typeof payloadText === 'string' ? payloadText : new TextDecoder().decode(payloadText);
            payload = JSON.parse(text);
          }
          const solaceMsg: SolaceMessage = {
            topic,
            payload,
            timestamp: Date.now()
          };

          subscribersRef.current.forEach((callbacks, pattern) => {
            if (topicMatches(topic, pattern)) {
              callbacks.forEach(cb => cb(solaceMsg));
            }
          });
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      });

      try {
        session.connect();
      } catch (error) {
        console.error('Error connecting to Solace:', error);
        scheduleReconnect();
      }
    };

    // Wake up immediately when the tab/app returns to the foreground — mobile
    // browsers commonly close the WebSocket while backgrounded.
    const handleVisibility = () => {
      if (document.hidden || isUnmounted) return;
      if (connectedRef.current) return;
      if (reconnectTimeout !== null) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      console.log('👁 [Admin] Page visible — reconnecting now');
      reconnectAttempt = 0;
      createAndConnect();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    createAndConnect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
        reconnectTimeout = null;
      }
      document.removeEventListener('visibilitychange', handleVisibility);
      const sess = sessionRef.current;
      sessionRef.current = null;
      disposeSession(sess);
    };
  }, [solaceConfig.url, solaceConfig.vpnName, solaceConfig.username, solaceConfig.password]);

  // Use a ref to track connected state for callbacks to avoid stale closures
  const connectedRef = useRef(connected);
  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const subscribe = useCallback((topicPattern: string, callback: MessageCallback) => {
    if (!sessionRef.current || !connectedRef.current) {
      console.warn(`⚠️ Cannot subscribe to ${topicPattern} - not connected`);
      return () => {};
    }

    try {
      const topic = solace.SolclientFactory.createTopicDestination(topicPattern);

      // Subscribe to topic
      sessionRef.current.subscribe(
        topic,
        true, // request confirmation
        topicPattern, // correlation key
        10000 // timeout
      );

      // Store callback
      if (!subscribersRef.current.has(topicPattern)) {
        subscribersRef.current.set(topicPattern, []);
      }
      subscribersRef.current.get(topicPattern)!.push(callback);

      console.log(`📥 [Admin] Subscribed to ${topicPattern}`);

      // Return unsubscribe function
      return () => {
        const callbacks = subscribersRef.current.get(topicPattern);
        if (callbacks) {
          const index = callbacks.indexOf(callback);
          if (index > -1) {
            callbacks.splice(index, 1);
          }
          if (callbacks.length === 0) {
            subscribersRef.current.delete(topicPattern);
            if (sessionRef.current && connectedRef.current) {
              try {
                sessionRef.current.unsubscribe(topic, true, topicPattern, 10000);
                console.log(`📤 [Admin] Unsubscribed from ${topicPattern}`);
              } catch (error) {
                console.error('Error unsubscribing:', error);
              }
            }
          }
        }
      };
    } catch (error) {
      console.error(`Error subscribing to ${topicPattern}:`, error);
      return () => {};
    }
  }, []);

  const publish = useCallback((topic: string, payload: any) => {
    if (!sessionRef.current || !connectedRef.current) {
      console.warn(`⚠️ Cannot publish to ${topic} - not connected`);
      return;
    }

    try {
      const message = solace.SolclientFactory.createMessage();
      message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
      message.setBinaryAttachment(JSON.stringify(payload));
      message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);

      sessionRef.current.send(message);
      console.log(`📤 [Admin] Published to ${topic}:`, payload);
    } catch (error) {
      console.error('Error publishing message:', error);
    }
  }, []);

  return {
    connected,
    subscribe,
    publish,
    config: solaceConfig
  };
}

// Helper function to check if topic matches pattern (supports wildcards)
function topicMatches(topic: string, pattern: string): boolean {
  const topicParts = topic.split('/');
  const patternParts = pattern.split('/');

  if (patternParts.length > topicParts.length) {
    return false;
  }

  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const topicPart = topicParts[i];

    if (patternPart === '*') {
      // Single-level wildcard matches any single level
      continue;
    } else if (patternPart === '>') {
      // Multi-level wildcard matches remaining levels
      return true;
    } else if (patternPart !== topicPart) {
      return false;
    }
  }

  return topicParts.length === patternParts.length;
}
