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
      className={`p-2 rounded-lg text-white transition-all ${
        enabled 
          ? 'bg-orange-600 hover:bg-orange-500' 
          : 'bg-gray-700 hover:bg-gray-600'
      }`}
      title={enabled ? 'Sound On' : 'Sound Off'}
    >
      {enabled ? '🔊' : '🔇'}
    </button>
  );
}
