import React from 'react';
import { motion } from 'framer-motion';

/**
 * Animated coin that bounces in to represent a vote.
 *
 * Props:
 *  coinIndex  – position within the card's coin row (affects delay)
 *  cardIndex  – position of the card in the list (affects delay)
 *  isJoker    – when true, renders as a purple joker coin instead of gold
 *  baseDelay  – base delay in seconds before the stagger starts (default 0.4)
 */
export default function VoteCoin({ coinIndex = 0, cardIndex = 0, isJoker = false, baseDelay = 0.4 }) {
  const goldStyle = {
    background: 'radial-gradient(circle at 35% 35%, #fef08a, #ca8a04)',
    border: '2px solid #facc15',
    boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.25)',
    color: '#713f12',
  };

  const jokerStyle = {
    background: 'radial-gradient(circle at 35% 35%, #c4b5fd, #7c3aed)',
    border: '2px solid #8b5cf6',
    boxShadow: '0 3px 6px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
    color: '#ede9fe',
  };

  return (
    <motion.div
      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold select-none flex-shrink-0"
      style={isJoker ? jokerStyle : goldStyle}
      initial={{ y: -64, opacity: 0, scale: 0.3, rotate: -40 }}
      animate={{ y: 0, opacity: 1, scale: 1, rotate: 0 }}
      transition={{
        delay: baseDelay + cardIndex * 0.22 + coinIndex * 0.12,
        type: 'spring',
        stiffness: 460,
        damping: 14,
        mass: 0.6,
      }}
    >
      {isJoker ? '♟' : '★'}
    </motion.div>
  );
}
