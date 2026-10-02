import { useGame } from '../../store/gameStore.jsx';
import { translations } from '../../locales/translations';

/** TV strings in the current language (falls back to English per key). */
export function useHostT() {
  const { state } = useGame();
  const lang = translations[state.lang] ? state.lang : 'en';
  return { ...translations.en.host, ...translations[lang].host, lang };
}

/** Fill `{name}` placeholders. */
export const fmt = (s, vars = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));

/** "1 vote" / "3 votes" in the TV language. */
export const votesLabel = (t, n) => fmt(n === 1 ? t.voteOne : t.voteMany, { n });
