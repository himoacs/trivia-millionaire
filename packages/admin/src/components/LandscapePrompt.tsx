import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function LandscapePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      // Show prompt if screen width < 768px AND orientation is portrait AND not dismissed
      const isSmallScreen = window.innerWidth < 768;
      const isPortrait = window.innerHeight > window.innerWidth;
      setShowPrompt(isSmallScreen && isPortrait && !dismissed);
    };

    checkOrientation();
    
    // Listen for orientation and resize changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, [dismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    setShowPrompt(false);
  };

  return (
    <AnimatePresence>
      {showPrompt && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={handleDismiss}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-gradient-to-br from-millionaire-navy via-millionaire-navy-dark to-millionaire-blue-dark border-2 border-orange-500/50 rounded-2xl p-6 m-4 max-w-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">📱→🔄</div>
              <h3 className="text-xl font-bold text-white mb-2">
                Rotate Your Device
              </h3>
              <p className="text-gray-300 mb-4">
                For the best experience, please rotate your device to landscape mode.
              </p>
              <button
                onClick={handleDismiss}
                className="btn-primary btn-sm w-full"
              >
                Got it
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
