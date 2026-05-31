/**
 * Presenter Sound Manager for Trivia Millionaire
 * WWTBAM-style sound effects for the presenter view
 */

type PresenterSoundType = 
  | 'question-reveal'      // When question first appears
  | 'timer-tick'           // Clock ticking during question
  | 'timer-tension'        // Last 5 seconds tension
  | 'time-up'              // Time expired
  | 'show-distribution'    // When showing answer distribution
  | 'reveal-answer'        // Revealing correct answer
  | 'correct-celebration'  // After showing correct answer
  | 'wrong-answer'         // Wrong answer reveal
  | 'leaderboard'          // Final leaderboard view
  | 'player-join'          // Player joins notification
  | 'game-start'           // Game starting
  | 'suspense-build';      // Building suspense

class PresenterSoundManager {
  private audioContext: AudioContext | null = null;
  private enabled: boolean = true;
  private tickingInterval: number | null = null;
  private isTicking: boolean = false;

  constructor() {
    // Initialize audio context on first interaction
    if (typeof window !== 'undefined') {
      document.addEventListener('click', () => this.ensureAudioContext(), { once: true });
    }
  }

  private ensureAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  /**
   * Play a sound effect
   */
  play(sound: PresenterSoundType): void {
    if (!this.enabled) return;
    this.ensureAudioContext();

    switch (sound) {
      case 'question-reveal':
        this.playQuestionReveal();
        break;
      case 'timer-tick':
        this.playTimerTick();
        break;
      case 'timer-tension':
        this.playTimerTension();
        break;
      case 'time-up':
        this.playTimeUp();
        break;
      case 'show-distribution':
        this.playShowDistribution();
        break;
      case 'reveal-answer':
        this.playRevealAnswer();
        break;
      case 'correct-celebration':
        this.playCorrectCelebration();
        break;
      case 'wrong-answer':
        this.playWrongAnswer();
        break;
      case 'leaderboard':
        this.playLeaderboard();
        break;
      case 'player-join':
        this.playPlayerJoin();
        break;
      case 'game-start':
        this.playGameStart();
        break;
      case 'suspense-build':
        this.playSuspenseBuild();
        break;
    }
  }

  /**
   * Start continuous ticking sound
   */
  startTicking(): void {
    if (!this.enabled || this.isTicking) return;
    this.isTicking = true;
    
    const tick = () => {
      if (!this.isTicking) return;
      this.playTimerTick();
      this.tickingInterval = window.setTimeout(tick, 1000);
    };
    
    tick();
  }

  /**
   * Stop continuous ticking sound
   */
  stopTicking(): void {
    this.isTicking = false;
    if (this.tickingInterval) {
      clearTimeout(this.tickingInterval);
      this.tickingInterval = null;
    }
  }

  /**
   * Enable/disable sounds
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.stopTicking();
    }
  }

  /**
   * Check if sounds are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  // ===== Sound Effects =====

  /**
   * WWTBAM-style question reveal sound
   */
  private playQuestionReveal(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Dramatic ascending chord progression
    const frequencies = [
      [196, 246.94, 293.66],  // G3, B3, D4
      [220, 277.18, 329.63],  // A3, C#4, E4
      [246.94, 311.13, 369.99] // B3, D#4, F#4
    ];
    
    frequencies.forEach((chord, i) => {
      const startTime = now + (i * 0.15);
      chord.forEach(freq => {
        this.playChordTone(freq, startTime, 0.25, 'triangle', 0.15);
      });
    });
    
    // Final impact
    setTimeout(() => {
      this.playImpact(now + 0.5);
    }, 500);
  }

  /**
   * Timer tick sound
   */
  private playTimerTick(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.value = 880; // A5 - high tick
    osc.type = 'sine';
    
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    
    osc.start(now);
    osc.stop(now + 0.05);
  }

  /**
   * Tension sound for last 5 seconds
   */
  private playTimerTension(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Low tension chord
    [110, 138.59, 164.81].forEach(freq => {
      this.playChordTone(freq, now, 0.8, 'sawtooth', 0.1);
    });
    
    // High tension beep
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.value = 1760; // A6 - urgent beep
    osc.type = 'square';
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * Time's up sound
   */
  private playTimeUp(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Dramatic descending sound
    for (let i = 0; i < 5; i++) {
      const freq = 880 - (i * 100);
      const startTime = now + (i * 0.1);
      
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      
      osc.frequency.value = freq;
      osc.type = 'triangle';
      
      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.15);
      
      osc.start(startTime);
      osc.stop(startTime + 0.15);
    }
    
    // Final low impact
    setTimeout(() => {
      this.playLowImpact(now + 0.5);
    }, 500);
  }

  /**
   * Show distribution sound
   */
  private playShowDistribution(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Ascending reveal sequence
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      this.playChordTone(freq, now + (i * 0.1), 0.2, 'sine', 0.15);
    });
  }

  /**
   * Reveal answer suspense build
   */
  private playRevealAnswer(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Dramatic drum roll effect
    for (let i = 0; i < 10; i++) {
      const startTime = now + (i * 0.05);
      
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      
      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      
      osc.frequency.value = 80 + (Math.random() * 40);
      osc.type = 'sawtooth';
      
      gain.gain.setValueAtTime(0.08, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.04);
      
      osc.start(startTime);
      osc.stop(startTime + 0.04);
    }
  }

  /**
   * Correct answer celebration
   */
  private playCorrectCelebration(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Victory fanfare
    const melody = [
      { freq: 523.25, time: 0 },     // C5
      { freq: 659.25, time: 0.15 },  // E5
      { freq: 783.99, time: 0.3 },   // G5
      { freq: 1046.50, time: 0.45 }, // C6
    ];
    
    melody.forEach(note => {
      const osc = this.audioContext!.createOscillator();
      const gain = this.audioContext!.createGain();
      
      osc.connect(gain);
      gain.connect(this.audioContext!.destination);
      
      osc.frequency.value = note.freq;
      osc.type = 'triangle';
      
      const startTime = now + note.time;
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
      
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  /**
   * Wrong answer sound
   */
  private playWrongAnswer(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Harsh descending sound
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.5);
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
    
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /**
   * Leaderboard fanfare
   */
  private playLeaderboard(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Grand finale fanfare
    const fanfare = [
      { freq: 523.25, time: 0 },     // C5
      { freq: 659.25, time: 0.1 },   // E5
      { freq: 783.99, time: 0.2 },   // G5
      { freq: 1046.50, time: 0.3 },  // C6
      { freq: 1318.51, time: 0.45 }, // E6
      { freq: 1567.98, time: 0.6 },  // G6
    ];
    
    fanfare.forEach(note => {
      [0, 0.002, 0.004].forEach(offset => { // Add slight chorus effect
        const osc = this.audioContext!.createOscillator();
        const gain = this.audioContext!.createGain();
        
        osc.connect(gain);
        gain.connect(this.audioContext!.destination);
        
        osc.frequency.value = note.freq * (1 + offset);
        osc.type = 'triangle';
        
        const startTime = now + note.time;
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.4);
        
        osc.start(startTime);
        osc.stop(startTime + 0.4);
      });
    });
  }

  /**
   * Player join notification
   */
  private playPlayerJoin(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Cheerful ascending arpeggio
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const startTime = now + (i * 0.08);
      this.playChordTone(freq, startTime, 0.15, 'sine', 0.12);
    });
  }

  /**
   * Game start sound
   */
  private playGameStart(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Epic game start fanfare
    const intro = [
      { freq: 130.81, time: 0 },    // C3
      { freq: 164.81, time: 0.2 },  // E3
      { freq: 196.00, time: 0.4 },  // G3
      { freq: 261.63, time: 0.6 },  // C4
    ];
    
    intro.forEach(note => {
      // Bass note
      this.playChordTone(note.freq, now + note.time, 0.3, 'sawtooth', 0.2);
      // Octave above
      this.playChordTone(note.freq * 2, now + note.time, 0.3, 'triangle', 0.15);
    });
  }

  /**
   * Suspense building sound
   */
  private playSuspenseBuild(): void {
    if (!this.audioContext) return;
    
    const now = this.audioContext.currentTime;
    
    // Low rumbling tension
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.setValueAtTime(55, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 1.5);
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 1.5);
    
    osc.start(now);
    osc.stop(now + 1.5);
  }

  // ===== Helper Methods =====

  private playChordTone(
    frequency: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.audioContext) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.value = frequency;
    osc.type = type;
    
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  private playImpact(startTime: number): void {
    if (!this.audioContext) return;
    
    // Cymbal-like crash
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    const filter = this.audioContext.createBiquadFilter();
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.value = 2000;
    osc.type = 'square';
    filter.type = 'highpass';
    filter.frequency.value = 1000;
    
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
    
    osc.start(startTime);
    osc.stop(startTime + 0.3);
  }

  private playLowImpact(startTime: number): void {
    if (!this.audioContext) return;
    
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(this.audioContext.destination);
    
    osc.frequency.value = 55;
    osc.type = 'sawtooth';
    
    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.5);
    
    osc.start(startTime);
    osc.stop(startTime + 0.5);
  }
}

// Export singleton instance
export const presenterSoundManager = new PresenterSoundManager();

/**
 * Hook for using presenter sounds in React components.
 *
 * The returned object MUST be referentially stable across renders — many
 * effects in PresenterView put `play` / `startTicking` / `stopTicking` in
 * their dep arrays, and re-creating the functions every render makes those
 * effects re-run constantly. For Solace subscription effects that meant
 * tearing down and re-establishing the broker subscription on every render,
 * which raced with incoming `question/released` messages and dropped them.
 *
 * Bind once at module load using the singleton manager.
 */
const stablePresenterSound = {
  play: (sound: PresenterSoundType) => presenterSoundManager.play(sound),
  startTicking: () => presenterSoundManager.startTicking(),
  stopTicking: () => presenterSoundManager.stopTicking(),
  setEnabled: (enabled: boolean) => presenterSoundManager.setEnabled(enabled),
  isEnabled: () => presenterSoundManager.isEnabled(),
};

export function usePresenterSound() {
  return stablePresenterSound;
}
