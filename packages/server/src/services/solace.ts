import solace from 'solclientjs';
import { getMessageTypeFromTopic } from '@trivia-millionaire/shared';

export interface SolaceConfig {
  url: string;
  vpnName: string;
  username: string;
  password: string;
}

export type MessageHandler = (topic: string, message: any) => void;

export class SolaceService {
  private session: solace.Session | null = null;
  private sessionProps: any;
  private messageHandlers: Map<string, MessageHandler[]> = new Map();
  private connected: boolean = false;

  constructor(config: SolaceConfig) {
    // Initialize Solace factory
    const factoryProps = new solace.SolclientFactoryProperties();
    factoryProps.profile = solace.SolclientFactoryProfiles.version10;
    solace.SolclientFactory.init(factoryProps);

    // Set up session properties
    this.sessionProps = {
      url: config.url,
      vpnName: config.vpnName,
      userName: config.username,
      password: config.password
    };
  }

  /**
   * Connect to Solace broker
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.session = solace.SolclientFactory.createSession(this.sessionProps);

        // Set up event handlers
        this.session.on(solace.SessionEventCode.UP_NOTICE, () => {
          console.log('✅ Connected to Solace broker');
          this.connected = true;
          resolve();
        });

        this.session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (error) => {
          console.error('❌ Connection failed:', error);
          this.connected = false;
          reject(error);
        });

        this.session.on(solace.SessionEventCode.DISCONNECTED, () => {
          console.log('🔌 Disconnected from Solace broker');
          this.connected = false;
        });

        this.session.on(solace.SessionEventCode.MESSAGE, (message) => {
          this.handleMessage(message);
        });

        // Connect to broker
        this.session.connect();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from Solace broker
   */
  disconnect(): void {
    if (this.session) {
      this.session.disconnect();
      this.session = null;
      this.connected = false;
    }
  }

  /**
   * Publish message to a topic
   */
  publish(topic: string, payload: any): void {
    if (!this.session || !this.connected) {
      console.warn(`⚠️  Solace not connected - skipping publish to ${topic}`);
      return;
    }

    try {
      const message = solace.SolclientFactory.createMessage();
      message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
      message.setBinaryAttachment(JSON.stringify(payload));
      message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);

      this.session.send(message);
      console.log(`📤 Published to ${topic}:`, payload);
    } catch (error) {
      console.error('Error publishing message:', error);
    }
  }

  /**
   * Subscribe to a topic (supports wildcards)
   */
  subscribe(topicPattern: string, handler: MessageHandler): void {
    if (!this.session || !this.connected) {
      console.warn(`⚠️  Solace not connected - skipping subscribe to ${topicPattern}`);
      return;
    }

    try {
      const topic = solace.SolclientFactory.createTopicDestination(topicPattern);
      this.session.subscribe(
        topic,
        true, // request confirmation
        topicPattern,
        10000 // timeout
      );

      // Store handler
      if (!this.messageHandlers.has(topicPattern)) {
        this.messageHandlers.set(topicPattern, []);
      }
      this.messageHandlers.get(topicPattern)!.push(handler);

      console.log(`📥 Subscribed to ${topicPattern}`);
    } catch (error) {
      console.error('Error subscribing to topic:', error);
      throw error;
    }
  }

  /**
   * Unsubscribe from a topic
   */
  unsubscribe(topicPattern: string): void {
    if (!this.session || !this.connected) {
      console.warn(`⚠️  Solace not connected - skipping unsubscribe from ${topicPattern}`);
      return;
    }

    try {
      const topic = solace.SolclientFactory.createTopicDestination(topicPattern);
      this.session.unsubscribe(
        topic,
        true, // request confirmation
        topicPattern,
        10000 // timeout
      );

      this.messageHandlers.delete(topicPattern);
      console.log(`🚫 Unsubscribed from ${topicPattern}`);
    } catch (error) {
      console.error('Error unsubscribing from topic:', error);
      throw error;
    }
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(message: solace.Message): void {
    try {
      const topic = message.getDestination()?.getName() || '';
      const binaryAttachment = message.getBinaryAttachment();
      const payloadStr = binaryAttachment instanceof Uint8Array 
        ? new TextDecoder().decode(binaryAttachment) 
        : binaryAttachment;
      const payload = payloadStr ? JSON.parse(payloadStr) : null;

      console.log(`📨 Received from ${topic}:`, payload);

      // Call all matching handlers
      this.messageHandlers.forEach((handlers, pattern) => {
        if (this.topicMatches(topic, pattern)) {
          handlers.forEach(handler => handler(topic, payload));
        }
      });
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  /**
   * Check if topic matches pattern (supports wildcards)
   * * = single level wildcard
   * > = multi-level wildcard
   */
  private topicMatches(topic: string, pattern: string): boolean {
    const topicLevels = topic.split('/');
    const patternLevels = pattern.split('/');

    for (let i = 0; i < patternLevels.length; i++) {
      if (patternLevels[i] === '>') {
        // Multi-level wildcard matches everything remaining
        return true;
      }
      
      if (patternLevels[i] === '*') {
        // Single-level wildcard matches one level
        continue;
      }

      if (topicLevels[i] !== patternLevels[i]) {
        return false;
      }
    }

    return topicLevels.length === patternLevels.length;
  }

  /**
   * Check if connected to broker
   */
  isConnected(): boolean {
    return this.connected;
  }
}
