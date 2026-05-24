import React from 'react';
import { motion } from 'framer-motion';

/**
 * Circular countdown timer ring.
 *
 * Props:
 *  secondsLeft  – current seconds remaining
 *  total        – total seconds for the round (default 30)
 *  paused       – when true, shows pause icon and purple colour
 *  size         – diameter in px (default 80)
 */
export default function TimerRing({ secondsLeft, total = 30, paused = false, size = 80 }) {
  const r = size / 2 - size * 0.1;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.max(0, secondsLeft / total));
  const strokeW = Math.max(4, size * 0.075);
  const fontSize = Math.round(size * 0.25);

  const color = paused
    ? '#6C5CE7'
    : secondsLeft <= 8
      ? '#FF6B6B'
      : secondsLeft <= 15
        ? '#FFE66D'
        : '#4ECDC4';

  const isUrgent = !paused && secondsLeft <= 8 && secondsLeft > 0;

  return (
    <motion.svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      animate={isUrgent ? { scale: [1, 1.07, 1] } : { scale: 1 }}
      transition={isUrgent ? { duration: 0.5, repeat: Infinity } : {}}
    >
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="#2D2D44" strokeWidth={strokeW}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={strokeW}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s linear, stroke 0.3s' }}
      />
      <text
        x={size / 2} y={size / 2 + fontSize * 0.35}
        textAnchor="middle"
        fill="white"
        fontSize={fontSize}
        fontWeight="bold"
        fontFamily="Nunito"
      >
        {paused ? '⏸' : secondsLeft}
      </text>
    </motion.svg>
  );
}
