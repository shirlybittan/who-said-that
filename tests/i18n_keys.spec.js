const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

test.describe('i18n keys test', () => {
  test('all languages should have the same keys', async () => {
    // Read translations.js manually to avoid Babel export syntax issues
    const translationsContent = fs.readFileSync(path.join(__dirname, '../client/src/locales/translations.js'), 'utf8');
    
    // Quick hack to extract the object
    const objStr = translationsContent.replace('export const translations = ', '').trim().replace(/;$/, '');
    const translations = JSON.parse(objStr);

    const langs = Object.keys(translations);
    expect(langs.length).toBeGreaterThanOrEqual(3);
    expect(langs).toContain('en');
    expect(langs).toContain('fr');
    expect(langs).toContain('he');

    const extractKeys = (obj, prefix = '') => {
      let keys = [];
      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          keys = keys.concat(extractKeys(obj[key], \`\${prefix}\${key}.\`));
        } else {
          keys.push(\`\${prefix}\${key}\`);
        }
      }
      return keys;
    };

    const enKeys = extractKeys(translations.en).sort();
    const frKeys = extractKeys(translations.fr).sort();
    const heKeys = extractKeys(translations.he).sort();

    expect(enKeys).toEqual(frKeys);
    expect(enKeys).toEqual(heKeys);
  });
});
