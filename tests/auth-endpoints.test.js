const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('crypto');
const { app } = require('../index');

// Helper to make request
function makeRequest(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = {};
        try {
          json = JSON.parse(data);
        } catch (e) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

test('Auth Endpoints (Login, Logout, Check-Auth)', async (t) => {
  const originalToken = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = 'test-admin-secret-token';

  // Start server on a random port
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  t.after(() => {
    server.close();
    if (originalToken !== undefined) {
      process.env.ADMIN_TOKEN = originalToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }
  });

  await t.test('POST /api/admin/login with invalid token returns 401', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { token: 'wrong-token' });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Invalid admin token' });
    assert.ok(!res.headers['set-cookie']);
  });

  await t.test('POST /api/admin/login with valid token returns 200 and sets cookie', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { token: 'test-admin-secret-token' });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, message: 'Logged in successfully' });
    assert.ok(res.headers['set-cookie']);
    const cookie = res.headers['set-cookie'][0];
    assert.ok(cookie.includes('admin_session='));
    assert.ok(cookie.includes('HttpOnly'));
  });

  await t.test('GET /api/admin/check-auth returns 401 when no session cookie is present', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/admin/check-auth',
      method: 'GET',
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { authenticated: false, error: 'Not authenticated' });
  });

  await t.test('GET /api/admin/check-auth returns 200 when valid session cookie is present', async () => {
    // 1. Login to get cookie
    const loginRes = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/admin/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { token: 'test-admin-secret-token' });

    const cookie = loginRes.headers['set-cookie'][0].split(';')[0];

    // 2. Check auth with cookie
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/admin/check-auth',
      method: 'GET',
      headers: { 'Cookie': cookie },
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { authenticated: true });
  });

  await t.test('POST /api/admin/logout clears session cookie', async () => {
    const res = await makeRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/admin/logout',
      method: 'POST',
    });

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, { success: true, message: 'Logged out successfully' });
    assert.ok(res.headers['set-cookie']);
    const cookie = res.headers['set-cookie'][0];
    assert.ok(cookie.includes('admin_session=;')); // should be empty
  });
});
