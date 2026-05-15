import { useState, useEffect } from 'react';
import { usePresenterSound } from '../utils/presenterSound';

export default function PresenterSoundToggle() {
  const { setEnabled, isEnabled } = usePresenterSound();
  const [enabled, setEnabledState] = useState(isEnabled());

  useEffect(() => {
    // Load from localStorage
    const savedState = localStorage.getItem('presenterSoundEnabled');
    const initialState = savedState === null ? true : savedState === 'true';
    setEnabledState(initialState);
    setEnabled(initialState);
  }, [setEnabled]);

  const toggleSound = () => {
    const newState = !enabled;
    setEnabledState(newState);
    setEnabled(newState);
    localStorage.setItem('presenterSoundEnabled', String(newState));
  };

  return (
    <button
      onClick={toggleSound}
      className={`btn-icon ${
        enabled 
          ? 'bg-orange-600 hover:bg-orange-500 text-white' 
          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
      }`}
      title={enabled ? 'Sound On - Click to mute' : 'Sound Off - Click to unmute'}
      aria-label={enabled ? 'Mute sound' : 'Unmute sound'}
      aria-pressed={enabled}
    >
      {enabled ? '🔊' : '🔇'}
    </button>
  );
}
