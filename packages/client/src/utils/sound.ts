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

  constructor() {
    // Initialize sounds
    // In a real app, you'd load actual audio files
    // For now, we'll use the Web Audio API to generate simple tones
  }

  /**
   * Play a sound effect
   */
  play(sound: SoundType): void {
    if (!this.enabled) return;

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
    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + duration
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration);
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
  };
}
