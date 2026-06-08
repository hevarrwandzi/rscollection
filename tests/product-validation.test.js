const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const { validateProductPayload, buildProductVisibilityWhere } = require('../index');

const validProduct = {
  slug: 'crown-charm-chain',
  name: 'Crown Charm Chain',
  description: 'A polished charm chain for dark anime accessory styling.',
  material: 'Alloy chain, mixed charms',
  color: 'Silver / multicolor',
  style: 'Charm chain',
  chain_length_cm: 45,
  price: 18,
  stock: 10,
  featured: true,
  image_url: '/assets/products/charm-chain.png',
  status: 'active',
};

test('validateProductPayload rejects unsafe slug values', () => {
  const result = validateProductPayload({ ...validProduct, slug: 'Bad Slug!' });
  assert.equal(result.error, 'slug must use lowercase letters, numbers, and hyphens only');
});

test('validateProductPayload requires integer stock', () => {
  const result = validateProductPayload({ ...validProduct, stock: 1.5 });
  assert.equal(result.error, 'stock must be a non-negative integer');
});

test('validateProductPayload converts active zero-stock products to sold_out', () => {
  const result = validateProductPayload({ ...validProduct, stock: 0, status: 'active' });
  assert.equal(result.error, undefined);
  assert.equal(result.payload.status, 'sold_out');
});

test('public product visibility only includes active in-stock products', () => {
  assert.equal(buildProductVisibilityWhere(), "status = 'active' AND stock > 0");
});
