const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const {
  defaultSiteContent,
  normalizeSiteContentPayload,
  buildSiteContentMap,
} = require('../index');

test('defaultSiteContent includes editable hero, catalog, contact, and theme keys', () => {
  const keys = defaultSiteContent.map((item) => item.key);
  const heroTitle = defaultSiteContent.find((item) => item.key === 'hero.title');

  assert.ok(keys.includes('hero.title'));
  assert.equal(heroTitle.value, 'Your style needs a main character arc.');
  assert.ok(keys.includes('hero.subtitle'));
  assert.ok(keys.includes('catalog.title'));
  assert.ok(keys.includes('contact.title'));
  assert.ok(keys.includes('theme.default'));
});

test('normalizeSiteContentPayload trims text values and accepts known theme values', () => {
  const textResult = normalizeSiteContentPayload({ value: '  New hero title  ' }, { input_type: 'textarea' });
  assert.equal(textResult.error, undefined);
  assert.equal(textResult.payload.value, 'New hero title');

  const themeResult = normalizeSiteContentPayload({ value: 'light' }, { input_type: 'theme' });
  assert.equal(themeResult.error, undefined);
  assert.equal(themeResult.payload.value, 'light');
});

test('normalizeSiteContentPayload rejects empty text and unknown theme values', () => {
  const emptyResult = normalizeSiteContentPayload({ value: '   ' }, { input_type: 'text' });
  assert.equal(emptyResult.error, 'content value is required');

  const themeResult = normalizeSiteContentPayload({ value: 'neon' }, { input_type: 'theme' });
  assert.equal(themeResult.error, 'theme.default must be dark or light');
});

test('buildSiteContentMap converts rows to key-value object', () => {
  const result = buildSiteContentMap([
    { key: 'hero.title', value: 'Editable title' },
    { key: 'contact.title', value: 'Message us' },
  ]);

  assert.deepEqual(result, {
    'hero.title': 'Editable title',
    'contact.title': 'Message us',
  });
});
