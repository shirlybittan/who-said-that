import React from 'react';
import { motion } from 'framer-motion';

/**
 * VotingArea — unified player-selection voting UI.
 *
 * Used by games that ask players to vote for another player:
 *   Most Likely To, Situational, Who Said That (player attribution),
 *   Drawing vote, Caption vote — anywhere a grid/list of player cards is needed.
 *
 * @param {object}   props
 * @param {Array}    props.players           - [{ id, name, color, avatar? }]
 * @param {Function} props.onVote            - (playerId) => void
 * @param {string|null} props.myVote         - ID of player this client has voted for, or null
 * @param {boolean}  props.disabled          - Disable all buttons (after voting or time up)
 * @param {boolean}  [props.allowSelfVote]   - Show the current player as a voteable option
 * @param {string}   [props.currentPlayerId] - Socket/player ID of the viewing client
 * @param {'grid'|'list'} [props.layout]     - Layout mode; defaults to 'grid'
 */
export default function VotingArea({
  players,
  onVote,
  myVote,
  disabled,
  allowSelfVote = false,
  currentPlayerId,
  layout = 'grid',
}) {
  const containerVariants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.85 },
    show:   { opacity: 1, scale: 1 },
  };

  const visiblePlayers = players.filter(
    (p) => allowSelfVote || p.id !== currentPlayerId
  );

  return (
    <motion.div
      className={
        layout === 'grid'
          ? 'w-full max-w-md grid grid-cols-2 gap-4'
          : 'w-full max-w-md flex flex-col gap-3'
      }
      variants={containerVariants}
      initial="hidden"
      animate="show"
    >
      {visiblePlayers.map((p) => {
        const isVoted    = myVote === p.id;
        const isSelf     = p.id === currentPlayerId;
        const isDisabled = disabled || (!allowSelfVote && isSelf);

        return (
          <motion.button
            key={p.id}
            onClick={() => !isDisabled && onVote(p.id)}
            disabled={isDisabled}
            variants={itemVariants}
            className={[
              'flex flex-col items-center p-6 rounded-2xl transition-all border-2',
              isVoted
                ? 'border-[#FFE66D] shadow-[0_0_20px_#FFE66D60] bg-[#FFE66D]/10'
                : isDisabled
                ? 'border-[#2D2D44] opacity-40 cursor-not-allowed'
                : 'border-[#2D2D44] hover:border-[#FFE66D]/40 bg-[#1A1A2E] cursor-pointer',
            ].join(' ')}
          >
            {/* Avatar circle */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-2 select-none"
              style={{ backgroundColor: p.color }}
            >
              {p.avatar ?? p.name[0].toUpperCase()}
            </div>

            <span className="text-white font-['Nunito'] text-sm text-center break-all">
              {p.name}
            </span>

            {isVoted && (
              <span className="text-[#FFE66D] text-xs mt-1">✓ Voted</span>
            )}
          </motion.button>
        );
      })}
    </motion.div>
  );
}
