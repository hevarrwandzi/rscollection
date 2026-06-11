const test = require('node:test');
const assert = require('node:assert/strict');

const { validateOrderAdminUpdatePayload } = require('../index');

test('validateOrderAdminUpdatePayload accepts status priority and internal note updates', () => {
  const result = validateOrderAdminUpdatePayload({
    status: 'contacted',
    priority: 'priority',
    admin_note: 'Customer asked for delivery after 5pm.',
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(result.payload, {
    status: 'contacted',
    priority: 'priority',
    admin_note: 'Customer asked for delivery after 5pm.',
  });
});

test('validateOrderAdminUpdatePayload rejects empty updates', () => {
  const result = validateOrderAdminUpdatePayload({});
  assert.equal(result.error, 'at least one order field must be provided');
});

test('validateOrderAdminUpdatePayload rejects invalid priority', () => {
  const result = validateOrderAdminUpdatePayload({ priority: 'urgent-now' });
  assert.equal(result.error, 'priority must be normal or priority');
});

test('validateOrderAdminUpdatePayload rejects overly long internal notes', () => {
  const result = validateOrderAdminUpdatePayload({ admin_note: 'x'.repeat(501) });
  assert.equal(result.error, 'admin_note must be 500 characters or less');
});
