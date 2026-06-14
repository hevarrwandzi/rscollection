const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const { validateProductPayload, normalizeColorOptions, normalizeProductImages, buildProductVisibilityWhere, productSortClause } = require('../index');

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
  image_urls: ['/assets/products/charm-chain.png', '/assets/products/charm-chain-side.png'],
  color_options: 'Silver / Black',
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

test('validateProductPayload keeps available colors and up to 3 gallery photos', () => {
  const result = validateProductPayload({
    ...validProduct,
    color: 'Silver',
    color_options: 'Silver / Black',
    image_urls: ['/assets/products/front.png', '/assets/products/side.png', '/assets/products/detail.png', '/assets/products/extra.png'],
  });

  assert.equal(result.error, undefined);
  assert.equal(result.payload.color_options, 'Silver / Black');
  assert.deepEqual(result.payload.image_urls, [
    '/assets/products/charm-chain.png',
    '/assets/products/front.png',
    '/assets/products/side.png',
  ]);
});

test('normalize helpers clean color lists and image galleries', () => {
  assert.equal(normalizeColorOptions(' Silver / Black ', 'Silver'), 'Silver / Black');
  assert.deepEqual(normalizeProductImages('/front.png', ['/side.png', '/front.png', '/detail.png']), ['/front.png', '/side.png', '/detail.png']);
});

test('public product visibility only includes active in-stock products', () => {
  assert.equal(buildProductVisibilityWhere(), "status = 'active' AND stock > 0");
});

test('productSortClause generates correct ORDER BY sql strings', () => {
  assert.equal(productSortClause('price-asc'), 'price ASC, featured DESC, created_at DESC');
  assert.equal(productSortClause('price-desc'), 'price DESC, featured DESC, created_at DESC');
  assert.equal(productSortClause('name-asc'), 'name ASC');

  // Test fallback/default cases
  assert.equal(productSortClause('name-desc'), 'featured DESC, created_at DESC');
  assert.equal(productSortClause('invalid'), 'featured DESC, created_at DESC');
  assert.equal(productSortClause(undefined), 'featured DESC, created_at DESC');
  assert.equal(productSortClause(null), 'featured DESC, created_at DESC');
  assert.equal(productSortClause(''), 'featured DESC, created_at DESC');
});
