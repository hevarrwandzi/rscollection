const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

console.log("Database connection settings:", {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ? "******" : undefined,
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});
// Health check endpoint used by Docker/Nginx/monitoring.
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
    style,
    chain_length_cm,
    price,
    stock,
    featured,
    image_url,
    created_at
  FROM products
`;

function requireAdmin(req, res, next) {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) {
    return res.status(500).json({ error: "Admin protection is not configured" });
  }

  const authHeader = req.get("authorization") || "";
  const suppliedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);

  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

function validateProductPayload(body) {
  const payload = {
    slug: body.slug?.toString().trim(),
    name: body.name?.toString().trim(),
    description: body.description?.toString().trim(),
    material: body.material?.toString().trim(),
    color: body.color?.toString().trim(),
    style: body.style?.toString().trim(),
    chain_length_cm: Number(body.chain_length_cm),
    price: Number(body.price),
    stock: Number(body.stock ?? 0),
    featured: Boolean(body.featured),
    image_url: body.image_url?.toString().trim() || null,
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

  if (!Number.isFinite(payload.chain_length_cm) || payload.chain_length_cm <= 0) {
    return { error: "chain_length_cm must be a positive number" };
  }

  if (!Number.isFinite(payload.price) || payload.price < 0) {
    return { error: "price must be a valid non-negative number" };
  }

  if (!Number.isFinite(payload.stock) || payload.stock < 0) {
    return { error: "stock must be a valid non-negative number" };
  }

  return { payload };
}

function sendDatabaseError(res, error) {
  if (error.code === "23505") {
    return res.status(409).json({ error: "A product with this slug already exists" });
  }

  return res.status(500).json({ error: "Internal server error" });
}

app.get("/api", (req, res) => {
  res.json({
    shop: "RS Collection",
    message: "Anime and gaming accessories shop API.",
    endpoints: [
      "GET /products",
      "GET /products/:id",
      "GET /featured-products",
      "POST /products (admin token required)",
      "PUT /products/:id (admin token required)",
      "DELETE /products/:id (admin token required)",
    ],
  });
});

app.get("/products", async (req, res) => {
  try {
    const { featured, style, maxPrice, q } = req.query;
    const conditions = [];
    const values = [];

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
       ORDER BY featured DESC, created_at DESC`,
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
       WHERE featured = true
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
       WHERE id = $1`,
      [id]
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

app.post("/products", requireAdmin, async (req, res) => {
  try {
    const { payload, error } = validateProductPayload(req.body);

    if (error) {
      return res.status(400).json({ error });
    }

    const result = await pool.query(
      `INSERT INTO products (
        slug, name, description, material, color, style, chain_length_cm, price, stock, featured, image_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        payload.slug,
        payload.name,
        payload.description,
        payload.material,
        payload.color,
        payload.style,
        payload.chain_length_cm,
        payload.price,
        payload.stock,
        payload.featured,
        payload.image_url,
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
           style = $6,
           chain_length_cm = $7,
           price = $8,
           stock = $9,
           featured = $10,
           image_url = $11
       WHERE id = $12
       RETURNING *`,
      [
        payload.slug,
        payload.name,
        payload.description,
        payload.material,
        payload.color,
        payload.style,
        payload.chain_length_cm,
        payload.price,
        payload.stock,
        payload.featured,
        payload.image_url,
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

app.delete("/products/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `DELETE FROM products
       WHERE id = $1
       RETURNING id, name`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json({ message: `Deleted ${result.rows[0].name}`, product: result.rows[0] });
  } catch (error) {
    console.error("Failed to delete product:", error.message);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
