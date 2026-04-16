import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSound } from '../utils/sound';

export default function SoundToggle() {
  const { isEnabled, setEnabled } = useSound();
  const [soundOn, setSoundOn] = useState(isEnabled());

  const toggleSound = () => {
    const newState = !soundOn;
    setSoundOn(newState);
    setEnabled(newState);
  };

  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={toggleSound}
      className="fixed top-4 right-4 z-50 bg-gradient-to-br from-purple-900/80 to-indigo-900/80 hover:from-purple-800/90 hover:to-indigo-800/90 text-white p-3 rounded-full shadow-lg border border-orange-500/50 backdrop-blur-sm transition-all"
      title={soundOn ? 'Mute sounds' : 'Unmute sounds'}
    >
      <span className="text-2xl">
        {soundOn ? '🔊' : '🔇'}
      </span>
    </motion.button>
  );
}
