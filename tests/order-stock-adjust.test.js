const test = require('node:test');
const assert = require('node:assert/strict');
const { updateOrderAndAdjustStock } = require('../index');

test('updateOrderAndAdjustStock returns 404 if order does not exist', async () => {
  const mockClient = {
    query: async (queryText, params) => {
      if (queryText.includes('SELECT status FROM orders')) {
        return { rows: [] };
      }
      return { rows: [] };
    }
  };

  const result = await updateOrderAndAdjustStock(mockClient, 999, { status: 'cancelled' });
  assert.equal(result.status, 404);
  assert.equal(result.error, 'Order not found');
});

test('updateOrderAndAdjustStock transitions order to cancelled and restores product stock', async () => {
  const queries = [];
  const mockClient = {
    query: async (queryText, params) => {
      queries.push({ text: queryText, params });
      if (queryText.includes('SELECT status FROM orders')) {
        return { rows: [{ status: 'new' }] };
      }
      if (queryText.includes('SELECT product_id, quantity, product_name FROM order_items')) {
        return { rows: [{ product_id: 42, quantity: 3, product_name: 'Crown Charm Chain' }] };
      }
      if (queryText.includes('SELECT id FROM products')) {
        return { rows: [{ id: 42 }] };
      }
      if (queryText.includes('UPDATE orders')) {
        return { rows: [{ id: 1, status: 'cancelled' }] };
      }
      return { rows: [] };
    }
  };

  const result = await updateOrderAndAdjustStock(mockClient, 1, { status: 'cancelled' });
  assert.equal(result.error, undefined);
  assert.equal(result.order.status, 'cancelled');

  // Verify stock restoration query was executed
  const restoreQuery = queries.find(q => q.text.includes('UPDATE products\n             SET stock = stock + $1'));
  assert.ok(restoreQuery);
  assert.deepEqual(restoreQuery.params, [3, 42]);

  // Verify order update query was executed
  const updateOrderQuery = queries.find(q => q.text.includes('UPDATE orders\n     SET status = $1\n     WHERE id = $2'));
  assert.ok(updateOrderQuery);
  assert.deepEqual(updateOrderQuery.params, ['cancelled', 1]);
});

test('updateOrderAndAdjustStock transitions order from cancelled to active and deducts product stock if sufficient', async () => {
  const queries = [];
  const mockClient = {
    query: async (queryText, params) => {
      queries.push({ text: queryText, params });
      if (queryText.includes('SELECT status FROM orders')) {
        return { rows: [{ status: 'cancelled' }] };
      }
      if (queryText.includes('SELECT product_id, quantity, product_name FROM order_items')) {
        return { rows: [{ product_id: 42, quantity: 2, product_name: 'Crown Charm Chain' }] };
      }
      if (queryText.includes('SELECT name, stock FROM products')) {
        return { rows: [{ name: 'Crown Charm Chain', stock: 10 }] };
      }
      if (queryText.includes('UPDATE orders')) {
        return { rows: [{ id: 1, status: 'contacted' }] };
      }
      return { rows: [] };
    }
  };

  const result = await updateOrderAndAdjustStock(mockClient, 1, { status: 'contacted' });
  assert.equal(result.error, undefined);
  assert.equal(result.order.status, 'contacted');

  // Verify stock deduction query was executed
  const deductQuery = queries.find(q => q.text.includes('UPDATE products\n             SET stock = stock - $1'));
  assert.ok(deductQuery);
  assert.deepEqual(deductQuery.params, [2, 42]);
});

test('updateOrderAndAdjustStock rejects transition from cancelled if stock is insufficient', async () => {
  const queries = [];
  const mockClient = {
    query: async (queryText, params) => {
      queries.push({ text: queryText, params });
      if (queryText.includes('SELECT status FROM orders')) {
        return { rows: [{ status: 'cancelled' }] };
      }
      if (queryText.includes('SELECT product_id, quantity, product_name FROM order_items')) {
        return { rows: [{ product_id: 42, quantity: 5, product_name: 'Crown Charm Chain' }] };
      }
      if (queryText.includes('SELECT name, stock FROM products')) {
        return { rows: [{ name: 'Crown Charm Chain', stock: 3 }] };
      }
      return { rows: [] };
    }
  };

  const result = await updateOrderAndAdjustStock(mockClient, 1, { status: 'confirmed' });
  assert.equal(result.status, 400);
  assert.equal(result.error, 'Insufficient stock to restore order: "Crown Charm Chain" only has 3 in stock (requested 5)');

  // Verify no stock deduction was called
  const deductQuery = queries.find(q => q.text.includes('UPDATE products\n             SET stock = stock - $1'));
  assert.equal(deductQuery, undefined);
});
