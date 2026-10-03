import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGame } from '../../store/gameStore.jsx';

const LABELS = { en: 'EN 🇬🇧', fr: 'FR 🇫🇷', he: 'HE 🇮🇱' };

/** Language picker. Inline (placed by the top bars), never floating. */
export default function LangSwitcher() {
  const { state, dispatch } = useGame();
  const [open, setOpen] = useState(false);
  const setLanguage = (lang) => { dispatch({ type: 'SET_LANG', payload: lang }); setOpen(false); };
  return (
    <div className="relative z-[60]">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="bg-[#2D2D44] text-white h-8 px-3 rounded-full text-sm font-bold border border-gray-600 hover:bg-[#FFE66D] hover:text-black transition flex items-center gap-1"
      >
        {LABELS[state.lang] || LABELS.en}
        <span className="text-[10px]">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-full mt-2 end-0 bg-[#1A1A2E] border border-[#2D2D44] rounded-lg shadow-xl overflow-hidden flex flex-col min-w-[100px]"
          >
            {Object.entries(LABELS).map(([lang, label]) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang)}
                className={`px-4 py-2 text-start hover:bg-[#2D2D44] text-sm transition-colors ${state.lang === lang ? 'text-[#4ECDC4] font-bold' : 'text-white'}`}
              >
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
