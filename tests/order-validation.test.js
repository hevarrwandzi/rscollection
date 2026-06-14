const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const {
  validateOrderRequestPayload,
  validateOrderStatus,
  allowedOrderStatuses,
} = require('../index');

const validOrder = {
  customer_name: 'Hevar Rwandzi',
  phone: '+9647501234567',
  city: 'Erbil',
  notes: 'Please confirm delivery time.',
  items: [
    { product_id: 1, quantity: 2 },
    { product_id: 2, quantity: 1 },
  ],
};

test('validateOrderRequestPayload accepts customer details and item quantities', () => {
  const result = validateOrderRequestPayload(validOrder);
  assert.equal(result.error, undefined);
  assert.equal(result.payload.customer_name, 'Hevar Rwandzi');
  assert.equal(result.payload.phone, '+9647501234567');
  assert.equal(result.payload.city, 'Erbil');
  assert.equal(result.payload.items.length, 2);
  assert.deepEqual(result.payload.items[0], { product_id: 1, quantity: 2 });
});

test('validateOrderRequestPayload rejects missing customer name', () => {
  const result = validateOrderRequestPayload({ ...validOrder, customer_name: '' });
  assert.equal(result.error, 'customer name is required');
});

test('validateOrderRequestPayload rejects invalid phone values', () => {
  const result = validateOrderRequestPayload({ ...validOrder, phone: 'abc' });
  assert.equal(result.error, 'phone/WhatsApp must be a valid contact number');
});

test('validateOrderRequestPayload rejects empty carts', () => {
  const result = validateOrderRequestPayload({ ...validOrder, items: [] });
  assert.equal(result.error, 'order must include at least one item');
});

test('validateOrderRequestPayload rejects non-positive item quantities', () => {
  const result = validateOrderRequestPayload({ ...validOrder, items: [{ product_id: 1, quantity: 0 }] });
  assert.equal(result.error, 'each order item needs a valid product_id and quantity');
});

test('validateOrderStatus accepts the shop-owner workflow statuses only', () => {
  assert.deepEqual(allowedOrderStatuses, ['new', 'contacted', 'confirmed', 'cancelled', 'fulfilled']);
  assert.equal(validateOrderStatus('confirmed').error, undefined);
  assert.equal(validateOrderStatus('shipped').error, 'status must be one of new, contacted, confirmed, cancelled, or fulfilled');
});

test('validateOrderRequestPayload rejects overly long customer name', () => {
  const result = validateOrderRequestPayload({ ...validOrder, customer_name: 'a'.repeat(256) });
  assert.equal(result.error, 'customer name must be 255 characters or less');
});

test('validateOrderRequestPayload rejects overly long city', () => {
  const result = validateOrderRequestPayload({ ...validOrder, city: 'a'.repeat(256) });
  assert.equal(result.error, 'city/location must be 255 characters or less');
});

test('validateOrderRequestPayload rejects overly long notes', () => {
  const result = validateOrderRequestPayload({ ...validOrder, notes: 'a'.repeat(1001) });
  assert.equal(result.error, 'notes must be 1000 characters or less');
});
