import { motion } from 'framer-motion';

/**
 * Wraps any page with a smooth slide-up + fade-in entrance animation.
 * Usage: wrap the outermost div of a page with <AnimatedPage>...</AnimatedPage>
 */
export default function AnimatedPage({ children, className = '' }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered list container — children animate in one after another.
 * Usage: <StaggerList> <motion.div variants={listItemVariants} /> ... </StaggerList>
 */
export const staggerContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.07, delayChildren: 0.1 },
  },
};

export const listItemVariants = {
  hidden: { opacity: 0, x: -20 },
  show:   { opacity: 1, x: 0, transition: { duration: 0.3, ease: 'easeOut' } },
};

export const popVariants = {
  hidden: { opacity: 0, scale: 0.7 },
  show:   { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 400, damping: 20 } },
};

/**
 * Quick pop animation — for score deltas, badges, etc.
 */
export function ScoreDelta({ delta, className = '' }) {
  if (!delta || delta === 0) return null;
  return (
    <motion.span
      className={`text-sm font-bold font-['Fredoka_One'] ${delta > 0 ? 'text-[#4ECDC4]' : 'text-[#FF6B6B]'} ${className}`}
      initial={{ opacity: 0, y: 8, scale: 0.8 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.4, duration: 0.4, type: 'spring', stiffness: 300 }}
    >
      {delta > 0 ? `+${delta}` : delta}
    </motion.span>
  );
}
