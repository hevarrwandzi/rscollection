const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const { Pool } = require("pg");
const rateLimit = require("express-rate-limit");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
require("dotenv").config();

const app = express();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: "Too many requests, please try again later." }
});

const orderLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour window
  max: 10, // start blocking after 10 requests
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many orders created from this IP, please try again after an hour" }
});

const uploadedProductImageDir = path.join(__dirname, "public", "assets", "uploads", "products");
let s3Client;
const uploadProductImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(new Error("Only JPG, PNG, WebP, or GIF product images are allowed"));
    }
    return cb(null, true);
  },
});

// Configure allowed CORS origins
const allowedOrigins = [
  "https://rscollection.online",
  "https://www.rscollection.online",
  "http://localhost",
  "http://localhost:3000",
  "http://127.0.0.1",
  "http://127.0.0.1:3000",
];

// Add origins from ALLOWED_ORIGINS env var if present (comma-separated)
if (process.env.ALLOWED_ORIGINS) {
  const envOrigins = process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
  allowedOrigins.push(...envOrigins);
}

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests, or server-to-server)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(limiter);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
});
pool.on("error", (err) => {
  console.error("Unexpected error on idle database client:", err);
});
// Health check endpoint used by Docker/Caddy/monitoring.
// It verifies both the Node process and PostgreSQL connectivity.
async function healthCheck(req, res) {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected",
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Health check failed:", error.message);

    res.status(503).json({
      status: "error",
      database: "disconnected",
      timestamp: new Date().toISOString(),
    });
  }
}

app.get("/health", healthCheck);
app.get("/api/health", healthCheck);
const productSelect = `
  SELECT
    id,
    slug,
    name,
    description,
    material,
    color,
    color_options,
    style,
    chain_length_cm,
    price,
    stock,
    featured,
    image_url,
    image_urls,
    COALESCE(status, 'active') AS status,
    created_at
  FROM products
`;

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0].trim();
    const val = parts.slice(1).join("=").trim();
    if (name) cookies[name] = val;
  });
  return cookies;
}

function base64url(buf) {
  return buf.toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(str) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf8");
}

function generateJWT(payload, secret) {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));

  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.createHmac("sha256", secret).update(signatureInput).digest();
  const encodedSignature = base64url(signature);

  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}

function verifyJWT(token, secret) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [encodedHeader, encodedPayload, encodedSignature] = parts;

    const signatureInput = `${encodedHeader}.${encodedPayload}`;
    const expectedSignature = crypto.createHmac("sha256", secret).update(signatureInput).digest();
    const expectedEncodedSignature = base64url(expectedSignature);

    if (!crypto.timingSafeEqual(Buffer.from(encodedSignature), Buffer.from(expectedEncodedSignature))) {
      return null;
    }

    const payload = JSON.parse(base64urlDecode(encodedPayload));
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload;
  } catch (err) {
    return null;
  }
}

// Admin protection uses one secret token from the server environment.
// The token is NOT stored in the browser or committed to GitHub; it lives in `.env`
// locally and in production secrets/env on the server. Admin requests must send it as:
//   Authorization: Bearer <ADMIN_TOKEN> or via admin_session HTTP-only cookie.
function hasValidAdminToken(req) {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) return false;

  // 1. Check Authorization Header (Bearer token)
  const authHeader = req.get("authorization") || "";
  if (authHeader.startsWith("Bearer ")) {
    const suppliedToken = authHeader.slice(7);
    const expectedHash = crypto.createHash("sha256").update(expectedToken).digest();
    const suppliedHash = crypto.createHash("sha256").update(suppliedToken).digest();
    if (crypto.timingSafeEqual(expectedHash, suppliedHash)) {
      return true;
    }
  }

  // 2. Check Cookie (JWT token)
  const cookieHeader = req.get("cookie") || "";
  const cookies = parseCookies(cookieHeader);
  const jwtSession = cookies.admin_session;
  if (jwtSession) {
    const verified = verifyJWT(jwtSession, expectedToken);
    if (verified && verified.role === "admin") {
      return true;
    }
  }

  return false;
}

// Express middleware for admin-only routes.
// If the token is missing or wrong, the request stops here before changing products,
// orders, storefront text, images, or any other protected data.
function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: "Admin protection is not configured" });
  }

  if (!hasValidAdminToken(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

function splitListValue(value) {
  if (Array.isArray(value)) return value;
  return value?.toString().split(/[,\n]/) || [];
}

function normalizeColorOptions(value, fallbackColor = "") {
  const colors = splitListValue(value)
    .map((item) => item?.toString().trim())
    .filter(Boolean);
  if (!colors.length && fallbackColor) colors.push(fallbackColor.trim());
  return Array.from(new Set(colors)).slice(0, 4).join(" / ");
}

function normalizeProductImages(primaryImage, imageValues) {
  const images = splitListValue(imageValues)
    .map((item) => item?.toString().trim())
    .filter(Boolean);
  const primary = primaryImage?.toString().trim();
  if (primary) images.unshift(primary);
  return Array.from(new Set(images)).slice(0, 3);
}

function validateProductPayload(body) {
  const payload = {
    slug: body.slug?.toString().trim(),
    name: body.name?.toString().trim(),
    description: body.description?.toString().trim(),
    material: body.material?.toString().trim(),
    color: body.color?.toString().trim(),
    color_options: normalizeColorOptions(body.color_options, body.color),
    style: body.style?.toString().trim(),
    chain_length_cm: Number(body.chain_length_cm),
    price: Number(body.price),
    stock: Number(body.stock ?? 0),
    featured: Boolean(body.featured),
    image_url: body.image_url?.toString().trim() || null,
    image_urls: normalizeProductImages(body.image_url, body.image_urls),
    status: body.status?.toString().trim() || "active",
  };

  if (
    !payload.slug ||
    !payload.name ||
    !payload.description ||
    !payload.material ||
    !payload.color ||
    !payload.style
  ) {
    return {
      error: "slug, name, description, material, color, and style are required",
    };
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(payload.slug)) {
    return { error: "slug must use lowercase letters, numbers, and hyphens only" };
  }

  if (!Number.isFinite(payload.chain_length_cm) || payload.chain_length_cm <= 0) {
    return { error: "chain_length_cm must be a positive number" };
  }

  if (!Number.isFinite(payload.price) || payload.price < 0) {
    return { error: "price must be a valid non-negative number" };
  }

  if (!Number.isInteger(payload.stock) || payload.stock < 0) {
    return { error: "stock must be a non-negative integer" };
  }

  const allowedStatuses = new Set(["draft", "active", "archived", "sold_out"]);
  if (!allowedStatuses.has(payload.status)) {
    return { error: "status must be one of draft, active, archived, or sold_out" };
  }

  if (!payload.image_url && payload.image_urls.length) {
    payload.image_url = payload.image_urls[0];
  }

  if (payload.image_urls.length > 3) {
    return { error: "image gallery can include up to 3 photos" };
  }

  if (payload.status === "active" && payload.stock === 0) {
    payload.status = "sold_out";
  }

  return { payload };
}

function buildProductVisibilityWhere() {
  return "status = 'active' AND stock > 0";
}

function productSortClause(sort) {
  switch (sort) {
    case "price-asc":
      return "price ASC, featured DESC, created_at DESC";
    case "price-desc":
      return "price DESC, featured DESC, created_at DESC";
    case "name-asc":
      return "name ASC";
    default:
      return "featured DESC, created_at DESC";
  }
}

function productImageExtension(mimetype) {
  return ({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  })[mimetype] || null;
}

function buildUploadedProductImagePath(file) {
  const extension = productImageExtension(file?.mimetype);
  if (!extension) return null;
  const filename = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const s3Bucket = process.env.S3_BUCKET;
  const s3PublicBaseUrl = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, "");

  if (s3Bucket && s3PublicBaseUrl) {
    const key = `products/${filename}`;

    return {
      filename,
      key,
      diskPath: null,
      publicUrl: `${s3PublicBaseUrl}/${filename}`,
    };
  }

  return {
    filename,
    key: null,
    diskPath: path.join(uploadedProductImageDir, filename),
    publicUrl: `/assets/uploads/products/${filename}`,
  };
}

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "eu-north-1" });
  }

  return s3Client;
}

async function storeProductImage(file, imagePath) {
  if (imagePath.key) {
    await getS3Client().send(new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: imagePath.key,
      Body: file.buffer,
      ContentType: file.mimetype,
      CacheControl: "public, max-age=31536000, immutable",
    }));
    return;
  }

  await fs.promises.mkdir(uploadedProductImageDir, { recursive: true });
  await fs.promises.writeFile(imagePath.diskPath, file.buffer, { flag: "wx" });
}

const defaultSiteContent = [
  {
    key: "theme.default",
    label: "Default theme",
    section: "Theme",
    value: "dark",
    input_type: "theme",
  },
  {
    key: "hero.eyebrow",
    label: "Hero eyebrow",
    section: "Hero",
    value: "Accessory shop story mode",
    input_type: "text",
  },
  {
    key: "hero.title",
    label: "Hero title",
    section: "Hero",
    value: "Your style needs a main character arc.",
    input_type: "text",
  },
  {
    key: "hero.subtitle",
    label: "Hero subtitle",
    section: "Hero",
    value: "Browse the drop, pick your item, then message RSCollection on WhatsApp or Instagram. Real photos, clear stock, simple ordering.",
    input_type: "textarea",
  },
  {
    key: "hero.primary_cta",
    label: "Hero primary button",
    section: "Hero",
    value: "Shop the drop",
    input_type: "text",
  },
  {
    key: "hero.secondary_cta",
    label: "Hero secondary button",
    section: "Hero",
    value: "See featured picks",
    input_type: "text",
  },
  {
    key: "catalog.title",
    label: "Catalog title",
    section: "Catalog",
    value: "Shop the drop",
    input_type: "text",
  },
  {
    key: "catalog.subtitle",
    label: "Catalog subtitle",
    section: "Catalog",
    value: "Search by product name, material, or style. Filter by accessory type and price.",
    input_type: "textarea",
  },
  {
    key: "featured.title",
    label: "Featured title",
    section: "Featured",
    value: "New drops & best picks",
    input_type: "text",
  },
  {
    key: "contact.title",
    label: "Contact title",
    section: "Contact",
    value: "Ready to buy from RSCollection?",
    input_type: "text",
  },
  {
    key: "contact.subtitle",
    label: "Contact subtitle",
    section: "Contact",
    value: "Add products to your order list, then send a prepared message through WhatsApp or Instagram. Simple, direct, and customer-friendly.",
    input_type: "textarea",
  },
  {
    key: "footer.description",
    label: "Footer description",
    section: "Footer",
    value: "Dark accessory drops, necklaces, pendants, charms, and fan-friendly pieces.",
    input_type: "textarea",
  },
];

function buildSiteContentMap(rows) {
  return rows.reduce((content, row) => {
    content[row.key] = row.value;
    return content;
  }, {});
}

function normalizeSiteContentPayload(body, definition) {
  const value = body.value?.toString().trim();
  if (!value) return { error: "content value is required" };
  if (value.length > 1200) return { error: "content value must be 1200 characters or less" };
  if (definition?.input_type === "theme" && !["dark", "light"].includes(value)) {
    return { error: "theme.default must be dark or light" };
  }
  return { payload: { value } };
}

const allowedOrderStatuses = ["new", "contacted", "confirmed", "cancelled", "fulfilled"];

function validateOrderStatus(status) {
  if (!allowedOrderStatuses.includes(status)) {
    return { error: "status must be one of new, contacted, confirmed, cancelled, or fulfilled" };
  }
  return { status };
}

function validateOrderAdminUpdatePayload(body) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const status = body.status?.toString().trim();
    const validation = validateOrderStatus(status);
    if (validation.error) return validation;
    payload.status = validation.status;
  }

  if (Object.prototype.hasOwnProperty.call(body, "priority")) {
    const priority = body.priority?.toString().trim() || "normal";
    if (!["normal", "priority"].includes(priority)) {
      return { error: "priority must be normal or priority" };
    }
    payload.priority = priority;
  }

  if (Object.prototype.hasOwnProperty.call(body, "admin_note")) {
    const adminNote = body.admin_note?.toString().trim() || null;
    if (adminNote && adminNote.length > 500) {
      return { error: "admin_note must be 500 characters or less" };
    }
    payload.admin_note = adminNote;
  }

  if (!Object.keys(payload).length) {
    return { error: "at least one order field must be provided" };
  }

  return { payload };
}

function validateOrderRequestPayload(body) {
  if (Array.isArray(body.items) && body.items.length > 50) {
    return { error: "order cannot exceed 50 items" };
  }

  const rawItems = Array.isArray(body.items) ? body.items.map((item) => ({
    product_id: Number(item.product_id ?? item.id),
    quantity: Number(item.quantity ?? item.qty),
  })) : [];

  const itemsMap = new Map();
  const validItems = [];
  const invalidItems = [];

  for (const item of rawItems) {
    if (Number.isInteger(item.product_id) && item.product_id > 0 && Number.isInteger(item.quantity) && item.quantity > 0) {
      if (itemsMap.has(item.product_id)) {
        itemsMap.get(item.product_id).quantity += item.quantity;
      } else {
        const copy = { ...item };
        itemsMap.set(item.product_id, copy);
        validItems.push(copy);
      }
    } else {
      invalidItems.push(item);
    }
  }

  const payload = {
    customer_name: body.customer_name?.toString().trim(),
    phone: body.phone?.toString().trim(),
    city: body.city?.toString().trim(),
    notes: body.notes?.toString().trim() || null,
    items: [...validItems, ...invalidItems],
  };

  if (!payload.customer_name) return { error: "customer name is required" };
  if (payload.customer_name.length > 255) return { error: "customer name must be 255 characters or less" };
  if (!payload.phone || !/^[+()0-9\s-]{7,24}$/.test(payload.phone)) {
    return { error: "phone/WhatsApp must be a valid contact number" };
  }
  if (!payload.city) return { error: "city/location is required" };
  if (payload.city.length > 255) return { error: "city/location must be 255 characters or less" };
  if (payload.notes && payload.notes.length > 1000) return { error: "notes must be 1000 characters or less" };
  if (!payload.items.length) return { error: "order must include at least one item" };
  if (payload.items.some((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    return { error: "each order item needs a valid product_id and quantity" };
  }

  return { payload };
}

function orderSelectWhereClause(status) {
  if (!status) return { clause: "", values: [] };
  const validation = validateOrderStatus(status);
  if (validation.error) return { error: validation.error };
  return { clause: "WHERE o.status = $1", values: [status] };
}

function sendDatabaseError(res, error) {
  if (error.code === "23505") {
    return res.status(409).json({ error: "A product with this slug already exists" });
  }

  return res.status(500).json({ error: "Internal server error" });
}

app.get("/api", (req, res) => {
  res.json({
    shop: "RSCollection",
    message: "Anime and gaming accessories shop API.",
    endpoints: [
      "GET /products",
      "GET /products/:id",
      "GET /featured-products",
      "GET /site-content",
      "GET /admin/site-content (admin token required)",
      "PUT /admin/site-content/:key (admin token required)",
      "POST /orders",
      "GET /orders (admin token required)",
      "PATCH /orders/:id (admin token required)",
      "PATCH /orders/:id/status (admin token required, status only)",
      "GET /admin/analytics (admin token required)",
      "POST /products (admin token required)",
      "PUT /products/:id (admin token required)",
      "PATCH /products/:id/stock (admin token required)",
      "DELETE /products/:id (admin token required)",
      "POST /api/admin/login",
      "POST /api/admin/logout",
      "GET /api/admin/check-auth",
    ],
  });
});

app.post("/api/admin/login", (req, res) => {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    return res.status(500).json({ error: "Admin protection is not configured on the server" });
  }

  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const expectedHash = crypto.createHash("sha256").update(expectedToken).digest();
  const suppliedHash = crypto.createHash("sha256").update(token.toString().trim()).digest();

  if (!crypto.timingSafeEqual(expectedHash, suppliedHash)) {
    return res.status(401).json({ error: "Invalid admin token" });
  }

  // Token is valid, generate JWT (expires in 8 hours)
  const sessionToken = generateJWT(
    { role: "admin", exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60 },
    expectedToken
  );

  res.cookie("admin_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.DB_SSL === "true",
    sameSite: "strict",
    path: "/",
    maxAge: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
  });

  return res.json({ success: true, message: "Logged in successfully" });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin_session", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" || process.env.DB_SSL === "true",
    sameSite: "strict",
    path: "/",
  });
  return res.json({ success: true, message: "Logged out successfully" });
});

app.get("/api/admin/check-auth", (req, res) => {
  if (hasValidAdminToken(req)) {
    return res.json({ authenticated: true });
  }
  return res.status(401).json({ authenticated: false, error: "Not authenticated" });
});

app.get("/site-content", async (req, res) => {
  try {
    const result = await pool.query("SELECT key, value FROM site_content ORDER BY section, key");
    res.json(buildSiteContentMap(result.rows));
  } catch (error) {
    console.error("Failed to fetch site content:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/admin/site-content", requireAdmin, async (req, res) => {
  try {
    const result = await pool.query("SELECT key, label, section, value, input_type, updated_at FROM site_content ORDER BY section, key");
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch admin site content:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/admin/site-content/:key", requireAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    const existing = await pool.query("SELECT key, input_type FROM site_content WHERE key = $1", [key]);
    if (!existing.rows.length) return res.status(404).json({ error: "Content key not found" });

    const { payload, error } = normalizeSiteContentPayload(req.body || {}, existing.rows[0]);
    if (error) return res.status(400).json({ error });

    const result = await pool.query(
      `UPDATE site_content
       SET value = $1, updated_at = CURRENT_TIMESTAMP
       WHERE key = $2
       RETURNING key, label, section, value, input_type, updated_at`,
      [payload.value, key]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update site content:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/products", async (req, res) => {
  try {
    const { featured, style, maxPrice, q, includeAll, sort } = req.query;
    const conditions = [];
    const values = [];

    if (includeAll === "true") {
      if (!hasValidAdminToken(req)) {
        return res.status(401).json({ error: "Unauthorized" });
      }
    } else {
      conditions.push(buildProductVisibilityWhere());
    }

    if (featured === "true") {
      values.push(true);
      conditions.push(`featured = $${values.length}`);
    }

    if (style) {
      values.push(style);
      conditions.push(`LOWER(style) = LOWER($${values.length})`);
    }

    if (maxPrice) {
      const parsedMaxPrice = Number(maxPrice);
      if (!Number.isFinite(parsedMaxPrice) || parsedMaxPrice < 0) {
        return res.status(400).json({ error: "maxPrice must be a valid non-negative number" });
      }
      values.push(parsedMaxPrice);
      conditions.push(`price <= $${values.length}`);
    }

    if (q) {
      values.push(`%${q}%`);
      conditions.push(
        `(name ILIKE $${values.length} OR description ILIKE $${values.length} OR material ILIKE $${values.length})`
      );
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const result = await pool.query(
      `${productSelect}
       ${whereClause}
       ORDER BY ${productSortClause(sort)}`,
      values
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch products:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/featured-products", async (req, res) => {
  try {
    const result = await pool.query(
      `${productSelect}
       WHERE featured = true AND ${buildProductVisibilityWhere()}
       ORDER BY created_at DESC`
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch featured products:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `${productSelect}
       WHERE id = $1
         AND (${buildProductVisibilityWhere()} OR $2 = true)`,
      [id, hasValidAdminToken(req)]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to fetch product:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/orders", orderLimiter, async (req, res) => {
  const client = await pool.connect();
  try {
    const { payload, error } = validateOrderRequestPayload(req.body);
    if (error) return res.status(400).json({ error });

    await client.query("BEGIN");
    const productIds = payload.items.map((item) => item.product_id);
    const productsResult = await client.query(
      `${productSelect}
       WHERE id = ANY($1::int[])
         AND ${buildProductVisibilityWhere()}
       FOR UPDATE`,
      [productIds]
    );

    const productsById = new Map(productsResult.rows.map((product) => [Number(product.id), product]));
    const orderItems = [];
    let totalPrice = 0;

    for (const item of payload.items) {
      const product = productsById.get(item.product_id);
      if (!product) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `product ${item.product_id} is unavailable` });
      }

      if (Number(product.stock) < item.quantity) {
        await client.query("ROLLBACK");
        return res.status(400).json({ error: `${product.name} only has ${product.stock} in stock` });
      }

      const unitPrice = Number(product.price);
      const lineTotal = unitPrice * item.quantity;
      totalPrice += lineTotal;
      orderItems.push({ product, quantity: item.quantity, unitPrice, lineTotal });
    }

    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, phone, city, notes, total_price, status)
       VALUES ($1, $2, $3, $4, $5, 'new')
       RETURNING *`,
      [payload.customer_name, payload.phone, payload.city, payload.notes, totalPrice]
    );
    const order = orderResult.rows[0];

    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, product_name, unit_price, quantity, line_total)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [order.id, item.product.id, item.product.name, item.unitPrice, item.quantity, item.lineTotal]
      );
      await client.query(
        `UPDATE products
         SET stock = stock - $1,
             status = CASE WHEN stock - $1 <= 0 THEN 'sold_out' ELSE status END
         WHERE id = $2`,
        [item.quantity, item.product.id]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({
      message: "Order request received. RSCollection will contact you to confirm availability and delivery.",
      order: { ...order, items: orderItems.map((item) => ({ product_name: item.product.name, unit_price: item.unitPrice, quantity: item.quantity, line_total: item.lineTotal })) },
    });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to create order:", error.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.get("/orders", requireAdmin, async (req, res) => {
  try {
    const where = orderSelectWhereClause(req.query.status?.toString());
    if (where.error) return res.status(400).json({ error: where.error });

    const result = await pool.query(
      `SELECT
         o.id,
         o.customer_name,
         o.phone,
         o.city,
         o.notes,
         o.admin_note,
         COALESCE(o.priority, 'normal') AS priority,
         o.total_price,
         o.status,
         o.created_at,
         COALESCE(json_agg(json_build_object(
           'id', oi.id,
           'product_id', oi.product_id,
           'product_name', oi.product_name,
           'unit_price', oi.unit_price,
           'quantity', oi.quantity,
           'line_total', oi.line_total
         ) ORDER BY oi.id) FILTER (WHERE oi.id IS NOT NULL), '[]') AS items
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       ${where.clause}
       GROUP BY o.id
       ORDER BY o.created_at DESC`,
      where.values
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch orders:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/admin/analytics", requireAdmin, async (req, res) => {
  try {
    // 1. Order status counts & revenue summary
    const orderStats = await pool.query(`
      SELECT
        status,
        COUNT(*)::int AS count,
        COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM orders
      GROUP BY status
    `);

    // 2. Top-selling products
    const topProducts = await pool.query(`
      SELECT
        product_name,
        SUM(quantity)::int AS units_sold,
        SUM(line_total)::numeric AS revenue
      FROM order_items
      GROUP BY product_name
      ORDER BY units_sold DESC
      LIMIT 5
    `);

    // 3. Sales by City
    const topCities = await pool.query(`
      SELECT
        city,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(total_price), 0)::numeric AS revenue
      FROM orders
      WHERE status <> 'cancelled'
      GROUP BY city
      ORDER BY revenue DESC
      LIMIT 5
    `);

    // 4. Stock Value and Metrics
    const stockStats = await pool.query(`
      SELECT
        COUNT(*)::int AS total_products,
        COUNT(CASE WHEN status = 'active' THEN 1 END)::int AS active_products,
        COUNT(CASE WHEN status = 'active' AND stock <= 3 AND stock > 0 THEN 1 END)::int AS low_stock_products,
        COUNT(CASE WHEN status = 'sold_out' OR stock = 0 THEN 1 END)::int AS sold_out_products,
        COALESCE(SUM(price * stock), 0)::numeric AS total_inventory_value
      FROM products
      WHERE status <> 'archived'
    `);

    res.json({
      orders: orderStats.rows,
      topProducts: topProducts.rows,
      topCities: topCities.rows,
      stock: stockStats.rows[0] || {
        total_products: 0,
        active_products: 0,
        low_stock_products: 0,
        sold_out_products: 0,
        total_inventory_value: 0
      }
    });
  } catch (error) {
    console.error("Failed to fetch analytics:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

async function updateOrderAndAdjustStock(client, orderId, fieldsToUpdate) {
  // 1. Fetch current order status and lock the row
  const orderResult = await client.query(
    "SELECT status FROM orders WHERE id = $1 FOR UPDATE",
    [orderId]
  );
  if (orderResult.rows.length === 0) {
    return { error: "Order not found", status: 404 };
  }

  const oldStatus = orderResult.rows[0].status;
  const newStatus = fieldsToUpdate.status;

  // If status is changing, handle stock adjustment
  if (newStatus && newStatus !== oldStatus) {
    // Fetch order items
    const itemsResult = await client.query(
      "SELECT product_id, quantity, product_name FROM order_items WHERE order_id = $1",
      [orderId]
    );
    const items = itemsResult.rows;

    if (oldStatus !== "cancelled" && newStatus === "cancelled") {
      // Transitioning to cancelled: Restore stock for all items
      for (const item of items) {
        if (item.product_id) {
          // Lock product row to prevent concurrent updates
          await client.query("SELECT id FROM products WHERE id = $1 FOR UPDATE", [item.product_id]);
          await client.query(
            `UPDATE products
             SET stock = stock + $1,
                 status = CASE WHEN status = 'sold_out' AND stock + $1 > 0 THEN 'active' ELSE status END
             WHERE id = $2`,
            [item.quantity, item.product_id]
          );
        }
      }
    } else if (oldStatus === "cancelled" && newStatus !== "cancelled") {
      // Transitioning from cancelled back to active: Deduct stock (verify availability)
      for (const item of items) {
        if (item.product_id) {
          // Lock and get product details
          const productResult = await client.query(
            "SELECT name, stock FROM products WHERE id = $1 FOR UPDATE",
            [item.product_id]
          );
          if (productResult.rows.length === 0) {
            return { error: `Product in order item "${item.product_name}" no longer exists`, status: 400 };
          }
          const product = productResult.rows[0];
          if (product.stock < item.quantity) {
            return {
              error: `Insufficient stock to restore order: "${product.name}" only has ${product.stock} in stock (requested ${item.quantity})`,
              status: 400
            };
          }
          await client.query(
            `UPDATE products
             SET stock = stock - $1,
                 status = CASE WHEN stock - $1 <= 0 THEN 'sold_out' ELSE status END
             WHERE id = $2`,
            [item.quantity, item.product_id]
          );
        }
      }
    }
  }

  // Update order fields
  const fields = [];
  const values = [];
  Object.entries(fieldsToUpdate).forEach(([key, value]) => {
    values.push(value);
    fields.push(`${key} = $${values.length}`);
  });
  values.push(orderId);

  const updateResult = await client.query(
    `UPDATE orders
     SET ${fields.join(", ")}
     WHERE id = $${values.length}
     RETURNING *`,
    values
  );

  return { order: updateResult.rows[0] };
}

app.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const status = req.body.status?.toString().trim();
    const validation = validateOrderStatus(status);
    if (validation.error) return res.status(400).json({ error: validation.error });

    await client.query("BEGIN");
    const result = await updateOrderAndAdjustStock(client, id, { status });
    if (result.error) {
      await client.query("ROLLBACK");
      return res.status(result.status || 500).json({ error: result.error });
    }
    await client.query("COMMIT");
    res.json(result.order);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to update order status:", error.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.patch("/orders/:id", requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payload, error } = validateOrderAdminUpdatePayload(req.body || {});
    if (error) return res.status(400).json({ error });

    await client.query("BEGIN");
    const result = await updateOrderAndAdjustStock(client, id, payload);
    if (result.error) {
      await client.query("ROLLBACK");
      return res.status(result.status || 500).json({ error: result.error });
    }
    await client.query("COMMIT");
    res.json(result.order);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("Failed to update order:", error.message);
    res.status(500).json({ error: "Internal server error" });
  } finally {
    client.release();
  }
});

app.post("/admin/product-images", requireAdmin, (req, res) => {
  uploadProductImage.single("image")(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        const status = uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400;
        const message = uploadError.code === "LIMIT_FILE_SIZE"
          ? "Product image must be 3MB or smaller"
          : uploadError.message;
        return res.status(status).json({ error: message });
      }

      if (!req.file) {
        return res.status(400).json({ error: "image file is required" });
      }

      const imagePath = buildUploadedProductImagePath(req.file);
      if (!imagePath) {
        return res.status(400).json({ error: "Unsupported image type" });
      }

      await storeProductImage(req.file, imagePath);
      return res.status(201).json({ image_url: imagePath.publicUrl, filename: imagePath.filename });
    } catch (error) {
      console.error("Failed to upload product image:", error.message);
      return res.status(500).json({ error: "Internal server error" });
    }
  });
});

app.post("/products", requireAdmin, async (req, res) => {
  try {
    const { payload, error } = validateProductPayload(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const result = await pool.query(
      `INSERT INTO products (
        slug, name, description, material, color, color_options, style, chain_length_cm, price, stock, featured, image_url, image_urls, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        payload.slug,
        payload.name,
        payload.description,
        payload.material,
        payload.color,
        payload.color_options,
        payload.style,
        payload.chain_length_cm,
        payload.price,
        payload.stock,
        payload.featured,
        payload.image_url,
        payload.image_urls,
        payload.status,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Failed to create product:", error.message);
    sendDatabaseError(res, error);
  }
});

app.put("/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { payload, error } = validateProductPayload(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const result = await pool.query(
      `UPDATE products
       SET slug = $1,
           name = $2,
           description = $3,
           material = $4,
           color = $5,
           color_options = $6,
           style = $7,
           chain_length_cm = $8,
           price = $9,
           stock = $10,
           featured = $11,
           image_url = $12,
           image_urls = $13,
           status = $14
       WHERE id = $15
       RETURNING *`,
      [
        payload.slug,
        payload.name,
        payload.description,
        payload.material,
        payload.color,
        payload.color_options,
        payload.style,
        payload.chain_length_cm,
        payload.price,
        payload.stock,
        payload.featured,
        payload.image_url,
        payload.image_urls,
        payload.status,
        id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update product:", error.message);
    sendDatabaseError(res, error);
  }
});

app.patch("/products/:id/stock", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const stock = Number(req.body.stock);

    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: "stock must be a non-negative integer" });
    }

    const result = await pool.query(
      `UPDATE products
       SET stock = $1,
           status = CASE WHEN $1 = 0 AND status = 'active' THEN 'sold_out' ELSE status END
       WHERE id = $2
       RETURNING *`,
      [stock, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update stock:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE products
       SET status = 'archived', featured = false
       WHERE id = $1
       RETURNING id, name, status`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: `Archived ${result.rows[0].name}`, product: result.rows[0] });
  } catch (error) {
    console.error("Failed to delete product:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/products/:id/restore", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE products
       SET status = CASE WHEN stock > 0 THEN 'active' ELSE 'sold_out' END
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Product not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to restore product:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = 3000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = {
  requireAdmin,
  app,
  hasValidAdminToken,
  validateProductPayload,
  normalizeColorOptions,
  normalizeProductImages,
  buildProductVisibilityWhere,
  productSortClause,
  validateOrderRequestPayload,
  validateOrderStatus,
  validateOrderAdminUpdatePayload,
  allowedOrderStatuses,
  productImageExtension,
  buildUploadedProductImagePath,
  defaultSiteContent,
  normalizeSiteContentPayload,
  buildSiteContentMap,
  sendDatabaseError,
  updateOrderAndAdjustStock,
};
