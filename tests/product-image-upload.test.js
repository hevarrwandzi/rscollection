const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { productImageExtension, buildUploadedProductImagePath } = require("../index");

test("productImageExtension allows only expected web image types", () => {
  assert.equal(productImageExtension("image/jpeg"), ".jpg");
  assert.equal(productImageExtension("image/png"), ".png");
  assert.equal(productImageExtension("image/webp"), ".webp");
  assert.equal(productImageExtension("image/gif"), ".gif");
  assert.equal(productImageExtension("text/plain"), null);
  assert.equal(productImageExtension(undefined), null);
});

test("buildUploadedProductImagePath creates a public product image URL under uploads", () => {
  const imagePath = buildUploadedProductImagePath({ mimetype: "image/png" });

  assert.match(imagePath.filename, /^\d+-[0-9a-f-]+\.png$/);
  assert.equal(imagePath.publicUrl, `/assets/uploads/products/${imagePath.filename}`);
  assert.equal(path.basename(imagePath.diskPath), imagePath.filename);
  assert.ok(imagePath.diskPath.endsWith(path.join("public", "assets", "uploads", "products", imagePath.filename)));
});

test("buildUploadedProductImagePath rejects unsupported image types", () => {
  assert.equal(buildUploadedProductImagePath({ mimetype: "application/pdf" }), null);
});
