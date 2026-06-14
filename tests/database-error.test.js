const test = require('node:test');
const assert = require('node:assert/strict');

const { sendDatabaseError } = require('../index');

test('sendDatabaseError sends 409 for unique violation (code 23505)', () => {
  let statusCode;
  let responseBody;

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
    }
  };

  const error = { code: '23505' };

  sendDatabaseError(res, error);

  assert.equal(statusCode, 409);
  assert.deepEqual(responseBody, { error: 'A product with this slug already exists' });
});

test('sendDatabaseError sends 500 for other database error codes', () => {
  let statusCode;
  let responseBody;

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
    }
  };

  const error = { code: '12345' };

  sendDatabaseError(res, error);

  assert.equal(statusCode, 500);
  assert.deepEqual(responseBody, { error: 'Internal server error' });
});

test('sendDatabaseError sends 500 when error code is missing', () => {
  let statusCode;
  let responseBody;

  const res = {
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (body) => {
      responseBody = body;
    }
  };

  const error = { message: 'Some random error' };

  sendDatabaseError(res, error);

  assert.equal(statusCode, 500);
  assert.deepEqual(responseBody, { error: 'Internal server error' });
});
