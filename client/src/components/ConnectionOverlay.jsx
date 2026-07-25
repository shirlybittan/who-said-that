import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../store/gameStore.jsx';

/**
 * Full-screen "Reconnecting…" overlay shown whenever the socket connection is
 * not healthy while the player is in a room. Gives a dropped/backgrounded
 * player clear feedback instead of a frozen screen, and reassures them their
 * spot is being restored (the server keeps their identity + progress and
 * re-syncs on reconnect via join_success).
 *
 * It is intentionally non-blocking: it does not unmount the game underneath,
 * so as soon as the socket reconnects and state re-syncs, the correct screen
 * is already there behind the overlay.
 */
const ConnectionOverlay = () => {
  const { state } = useGame();

  // Only relevant once the player is actually in a room. On the home screen a
  // disconnected socket is expected and shouldn't nag anyone.
  const inRoom = !!state.roomCode && state.phase && state.phase !== 'home';
  const show = inRoom && state.connection !== 'online';

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-[#0D0D1A]/85 backdrop-blur-sm text-center px-8"
          role="status"
          aria-live="polite"
          data-testid="connection-overlay"
        >
          <motion.div
            className="w-14 h-14 rounded-full border-4 border-[#2D2D44] border-t-[#4ECDC4]"
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
          />
          <h2 className="mt-6 text-2xl font-['Fredoka_One'] text-[#FFE66D]">
            {state.connection === 'offline' ? 'Connection lost' : 'Reconnecting…'}
          </h2>
          <p className="mt-2 text-sm text-gray-300 font-['Nunito'] max-w-xs">
            Hang tight — your spot is saved. We'll drop you right back into the
            game as soon as you're back online.
          </p>
          {state.roomCode && (
            <p className="mt-4 text-xs text-gray-500 font-['Nunito'] uppercase tracking-widest">
              Room {state.roomCode}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConnectionOverlay;
