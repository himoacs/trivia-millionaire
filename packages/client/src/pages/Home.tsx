import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Home() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if code is in URL
    const urlCode = searchParams.get('code');
    if (urlCode) {
      setCode(urlCode.toUpperCase());
    }
  }, [searchParams]);

  const handleJoin = async () => {
    if (code.trim().length !== 6) return;

    setLoading(true);
    setError('');

    try {
      // Validate session code exists before navigating
      const response = await axios.get(`${API_URL}/api/session/${code.toUpperCase()}/info`);
      if (response.data.success) {
        if (response.data.data.state === 'CLOSED') {
          setError('This game has ended');
        } else {
          navigate(`/join/${code.toUpperCase()}`);
        }
      }
    } catch (err: any) {
      setError('Invalid game code. Please check and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Solace Logo Banner */}
      <div className="w-full bg-gradient-to-r from-purple-950/80 via-indigo-950/80 to-purple-950/80 border-b border-orange-500/30 px-6 py-3 flex-shrink-0">
        <img src="/solace-logo.svg" alt="Solace" className="h-6 md:h-8 opacity-80 hover:opacity-100 transition-opacity" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center max-w-md w-full"
      >
        {/* Logo/Title */}
        <motion.div
          initial={{ y: -50 }}
          animate={{ y: 0 }}
          transition={{ type: "spring", stiffness: 100 }}
          className="mb-12"
        >
          <h1 className="text-6xl font-black text-orange-500 mb-4 float-animation drop-shadow-[0_0_30px_rgba(255,149,0,0.8)]">
            💰
          </h1>
          <h1 className="text-5xl font-black text-white mb-2 drop-shadow-lg">
            Trivia Millionaire
          </h1>
          <p className="text-orange-400 text-lg font-semibold drop-shadow-lg">
            Powered by Solace
          </p>
        </motion.div>

        {/* Code Input */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gradient-to-br from-purple-950 via-purple-900 to-indigo-950 rounded-2xl shadow-[0_0_30px_rgba(255,149,0,0.4)] p-8 border-2 border-orange-500"
        >
          <h2 className="text-2xl font-bold text-white mb-6 drop-shadow-lg">
            Enter Game Code
          </h2>

          <input
            type="text"
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError(''); // Clear error when typing
            }}
            placeholder="ABC123"
            maxLength={6}
            className={`w-full text-center text-3xl font-bold tracking-widest px-4 py-4 border-4 ${error ? 'border-red-500' : 'border-orange-500'} bg-gray-900 text-white rounded-xl focus:outline-none focus:ring-4 focus:ring-orange-400 mb-2 shadow-[0_0_20px_rgba(255,149,0,0.3)] placeholder-gray-500`}
            style={{ letterSpacing: '0.5em' }}
            autoFocus
            onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
          />

          {/* Error message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-sm font-semibold mb-4"
            >
              {error}
            </motion.p>
          )}
          {!error && <div className="mb-4" />}

          <button
            onClick={handleJoin}
            disabled={code.length !== 6 || loading}
            className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-xl text-xl transition-all duration-300 transform hover:scale-105 active:scale-95 shadow-[0_0_25px_rgba(255,149,0,0.5)]"
          >
            {loading ? 'Checking...' : 'Join Game! 🚀'}
          </button>
        </motion.div>

        {/* Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-white text-sm drop-shadow-lg"
        >
          <p>Get the code from your game admin</p>
          <p className="mt-2">or scan the QR code</p>
        </motion.div>
      </motion.div>
      </div>

      {/* Footer Credit */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2 text-[#2DD4BF] text-sm">
        <span>Created by Himanshu Gupta</span>
        <a 
          href="https://www.linkedin.com/in/guptahim/" 
          target="_blank" 
          rel="noopener noreferrer"
          className="hover:opacity-80 transition-opacity"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="#2DD4BF">
            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
          </svg>
        </a>
      </div>
    </div>
  );
}
