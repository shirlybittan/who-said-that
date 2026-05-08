import React, { useState } from 'react';

/**
 * TextInputAction — reusable text caption / answer input.
 *
 * Props:
 *   hasSubmitted    {boolean}
 *   onSubmit        {fn(text)}
 *   placeholder     {string}
 *   maxLength       {number}   (default 140)
 *   submitLabel     {string}   (default "Submit")
 *   waitingLabel    {string}
 *   submittedCount  {number}
 *   totalCount      {number}
 */
export default function TextInputAction({
  hasSubmitted,
  onSubmit,
  placeholder = 'Write your answer…',
  maxLength = 140,
  submitLabel = 'Submit',
  waitingLabel = 'Answer submitted! ✓',
  submittedCount = 0,
  totalCount = 0,
}) {
  const [text, setText] = useState('');

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || hasSubmitted) return;
    onSubmit(trimmed);
  };

  if (hasSubmitted) {
    return (
      <div className="w-full bg-[#1A1A2E] rounded-2xl border border-[#2D2D44] p-5 text-center">
        <p className="text-[#4ECDC4] font-['Fredoka_One'] text-xl mb-2">{waitingLabel}</p>
        {totalCount > 0 && (
          <p className="text-gray-400 font-['Nunito'] text-sm">
            Waiting for others… ({submittedCount}/{totalCount})
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-3">
      <textarea
        className="w-full bg-[#1A1A2E] border border-[#2D2D44] rounded-2xl p-4 text-white font-['Nunito'] text-base resize-none focus:outline-none focus:border-[#4ECDC4] transition"
        rows={4}
        maxLength={maxLength}
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
      />
      <div className="flex items-center justify-between">
        <span className="text-gray-500 font-['Nunito'] text-xs">{text.length}/{maxLength}</span>
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="bg-[#FF6B6B] text-white font-['Fredoka_One'] px-6 py-2 rounded-xl hover:bg-[#e05a5a] disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
