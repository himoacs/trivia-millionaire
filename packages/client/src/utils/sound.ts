/**
 * Sound Manager for Trivia Mesh
 * Handles all sound effects for the game
 */

type SoundType = 
  | 'join'
  | 'question-start'
  | 'tick'
  | 'correct'
  | 'wrong'
  | 'leaderboard'
  | 'countdown';

class SoundManager {
  private enabled: boolean = true;
  private audioContext: AudioContext | null = null;
  private initialized: boolean = false;

  constructor() {
    // Initialize on first user interaction
  }

  /**
   * Initialize AudioContext - must be called from user gesture
   */
  initialize(): void {
    if (this.initialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      this.initialized = true;
      
      // Resume if suspended (required for mobile)
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      
      console.log('🔊 Audio initialized');
    } catch (error) {
      console.warn('Audio not supported:', error);
    }
  }

  /**
   * Resume audio context - call on any user interaction
   */
  resume(): void {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Play a sound effect
   */
  play(sound: SoundType): void {
    if (!this.enabled) return;
    
    // Auto-initialize on first play attempt
    if (!this.initialized) {
      this.initialize();
    }
    
    // Resume if needed
    this.resume();

    switch (sound) {
      case 'join':
        this.playTone(523.25, 0.1, 'sine'); // C5
        break;
      case 'question-start':
        this.playTone(659.25, 0.2, 'square'); // E5
        break;
      case 'tick':
        this.playTone(440, 0.05, 'sine'); // A4
        break;
      case 'correct':
        this.playSuccessTone();
        break;
      case 'wrong':
        this.playErrorTone();
        break;
      case 'leaderboard':
        this.playVictoryTone();
        break;
      case 'countdown':
        this.playTone(880, 0.1, 'triangle'); // A5
        break;
    }
  }

  /**
   * Enable/disable sounds
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    // Initialize when enabling (user gesture)
    if (enabled && !this.initialized) {
      this.initialize();
    }
  }

  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Play a simple tone using Web Audio API
   */
  private playTone(
    frequency: number,
    duration: number,
    type: OscillatorType = 'sine'
  ): void {
    if (!this.audioContext) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      oscillator.frequency.value = frequency;
      oscillator.type = type;

      gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        this.audioContext.currentTime + duration
      );

      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch (error) {
      console.warn('Error playing tone:', error);
    }
  }

  /**
   * Play success melody (correct answer)
   */
  private playSuccessTone(): void {
    this.playTone(523.25, 0.1); // C5
    setTimeout(() => this.playTone(659.25, 0.1), 100); // E5
    setTimeout(() => this.playTone(783.99, 0.2), 200); // G5
  }

  /**
   * Play error sound (wrong answer)
   */
  private playErrorTone(): void {
    this.playTone(200, 0.3, 'sawtooth');
  }

  /**
   * Play victory fanfare (leaderboard)
   */
  private playVictoryTone(): void {
    this.playTone(523.25, 0.15); // C5
    setTimeout(() => this.playTone(659.25, 0.15), 150); // E5
    setTimeout(() => this.playTone(783.99, 0.15), 300); // G5
    setTimeout(() => this.playTone(1046.50, 0.3), 450); // C6
  }
}

// Export singleton instance
export const soundManager = new SoundManager();

/**
 * Hook for using sounds in React components
 */
export function useSound() {
  return {
    play: (sound: SoundType) => soundManager.play(sound),
    setEnabled: (enabled: boolean) => soundManager.setEnabled(enabled),
    isEnabled: () => soundManager.isEnabled(),
    initialize: () => soundManager.initialize(),
    resume: () => soundManager.resume(),
  };
}
