const { test } = require("node:test");
const assert = require("node:assert");
const { hasValidAdminToken } = require("../index");

// A simple mock for the Express request object
function createMockRequest(authHeaderValue) {
  return {
    get: (headerName) => {
      if (headerName.toLowerCase() === "authorization") {
        return authHeaderValue;
      }
      return undefined;
    },
  };
}

test("hasValidAdminToken", async (t) => {
  const originalToken = process.env.ADMIN_TOKEN;

  t.afterEach(() => {
    // Restore the original token after each test
    if (originalToken !== undefined) {
      process.env.ADMIN_TOKEN = originalToken;
    } else {
      delete process.env.ADMIN_TOKEN;
    }
  });

  await t.test("returns false when ADMIN_TOKEN env variable is missing", () => {
    delete process.env.ADMIN_TOKEN;
    const req = createMockRequest("Bearer mysecret");
    assert.strictEqual(hasValidAdminToken(req), false);
  });

  await t.test("returns true for a valid supplied token", () => {
    process.env.ADMIN_TOKEN = "mysecret";
    const req = createMockRequest("Bearer mysecret");
    assert.strictEqual(hasValidAdminToken(req), true);
  });

  await t.test("returns false for an invalid token of the same length", () => {
    process.env.ADMIN_TOKEN = "mysecret";
    // "notsecret" is 9 chars, "mysecret" is 8. Let's make them same length:
    // "mysecret" (8) vs "badtoken" (8)
    const req = createMockRequest("Bearer badtoken");
    assert.strictEqual(hasValidAdminToken(req), false);
  });

  await t.test("returns false for an invalid token of a different length", () => {
    process.env.ADMIN_TOKEN = "mysecret";
    const req = createMockRequest("Bearer wrong");
    assert.strictEqual(hasValidAdminToken(req), false);
  });

  await t.test("returns false when authorization header is missing", () => {
    process.env.ADMIN_TOKEN = "mysecret";
    const req = createMockRequest(undefined);
    assert.strictEqual(hasValidAdminToken(req), false);
  });

  await t.test("returns false when authorization header is empty", () => {
    process.env.ADMIN_TOKEN = "mysecret";
    const req = createMockRequest("");
    assert.strictEqual(hasValidAdminToken(req), false);
  });

  await t.test("returns false when authorization header does not start with Bearer", () => {
    process.env.ADMIN_TOKEN = "mysecret";
    const req = createMockRequest("Token mysecret");
    assert.strictEqual(hasValidAdminToken(req), false);
  });
});
