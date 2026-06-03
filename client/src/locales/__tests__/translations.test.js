import { describe, it, expect } from 'vitest';
import { translations } from '../translations';

function getLeafKeys(obj, prefix = '') {
  return Object.keys(obj).flatMap((key) => {
    const value = obj[key];
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return getLeafKeys(value, fullKey);
    }
    return [fullKey];
  });
}

describe('translations', () => {
  it('keeps French keys in sync with English', () => {
    const enKeys = getLeafKeys(translations.en);
    const frKeys = getLeafKeys(translations.fr);

    expect(frKeys.sort()).toEqual(enKeys.sort());
  });
});
