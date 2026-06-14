const test = require('node:test');
const assert = require('node:assert/strict');
const { requireAdmin } = require('../index');

test('requireAdmin rejects requests when ADMIN_TOKEN is not configured', (t) => {
  const originalAdminToken = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;

  const req = {};
  let statusResult = null;
  let jsonResult = null;
  const res = {
    status: (code) => {
      statusResult = code;
      return res;
    },
    json: (data) => {
      jsonResult = data;
      return res;
    }
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  requireAdmin(req, res, next);

  assert.equal(statusResult, 500);
  assert.deepEqual(jsonResult, { error: "Admin protection is not configured" });
  assert.equal(nextCalled, false);

  if (originalAdminToken !== undefined) {
    process.env.ADMIN_TOKEN = originalAdminToken;
  }
});

test('requireAdmin rejects requests with unauthorized token', (t) => {
  process.env.ADMIN_TOKEN = 'secret-token';

  const req = {
    get: (header) => {
      if (header === 'authorization') return 'Bearer wrong-token';
      return undefined;
    }
  };
  let statusResult = null;
  let jsonResult = null;
  const res = {
    status: (code) => {
      statusResult = code;
      return res;
    },
    json: (data) => {
      jsonResult = data;
      return res;
    }
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  requireAdmin(req, res, next);

  assert.equal(statusResult, 401);
  assert.deepEqual(jsonResult, { error: "Unauthorized" });
  assert.equal(nextCalled, false);
});

test('requireAdmin rejects requests without token', (t) => {
  process.env.ADMIN_TOKEN = 'secret-token';

  const req = {
    get: (header) => undefined
  };
  let statusResult = null;
  let jsonResult = null;
  const res = {
    status: (code) => {
      statusResult = code;
      return res;
    },
    json: (data) => {
      jsonResult = data;
      return res;
    }
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  requireAdmin(req, res, next);

  assert.equal(statusResult, 401);
  assert.deepEqual(jsonResult, { error: "Unauthorized" });
  assert.equal(nextCalled, false);
});

test('requireAdmin proceeds to next middleware when correct token is provided', (t) => {
  process.env.ADMIN_TOKEN = 'secret-token';

  const req = {
    get: (header) => {
      if (header === 'authorization') return 'Bearer secret-token';
      return undefined;
    }
  };
  let statusResult = null;
  let jsonResult = null;
  const res = {
    status: (code) => {
      statusResult = code;
      return res;
    },
    json: (data) => {
      jsonResult = data;
      return res;
    }
  };
  let nextCalled = false;
  const next = () => {
    nextCalled = true;
  };

  requireAdmin(req, res, next);

  assert.equal(statusResult, null);
  assert.equal(jsonResult, null);
  assert.equal(nextCalled, true);
});
