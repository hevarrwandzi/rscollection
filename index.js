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
    style,
    chain_length_cm,
    price,
    stock,
    featured,
    image_url,
    COALESCE(status, 'active') AS status,
    created_at
  FROM products
`;

function hasValidAdminToken(req) {
  const expectedToken = process.env.ADMIN_TOKEN;
  if (!expectedToken) return false;

  const authHeader = req.get("authorization") || "";
  const suppliedToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const expected = Buffer.from(expectedToken);
  const supplied = Buffer.from(suppliedToken);

  return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_TOKEN) {
    return res.status(500).json({ error: "Admin protection is not configured" });
  }

  if (!hasValidAdminToken(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  return next();
}

async function ensureDatabaseSchema() {
  await pool.query("ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'");
  await pool.query("UPDATE products SET status = 'active' WHERE status IS NULL OR status = ''");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      city TEXT NOT NULL,
      notes TEXT,
      admin_note TEXT,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'priority')),
      total_price NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (total_price >= 0),
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'confirmed', 'cancelled', 'fulfilled')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_note TEXT");
  await pool.query("ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'");
  await pool.query("UPDATE orders SET priority = 'normal' WHERE priority IS NULL OR priority = ''");
  await pool.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name TEXT NOT NULL,
      unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
    )
  `);
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
  const payload = {
    customer_name: body.customer_name?.toString().trim(),
    phone: body.phone?.toString().trim(),
    city: body.city?.toString().trim(),
    notes: body.notes?.toString().trim() || null,
    items: Array.isArray(body.items) ? body.items.map((item) => ({
      product_id: Number(item.product_id ?? item.id),
      quantity: Number(item.quantity ?? item.qty),
    })) : [],
  };

  if (!payload.customer_name) return { error: "customer name is required" };
  if (!payload.phone || !/^[+()0-9\s-]{7,24}$/.test(payload.phone)) {
    return { error: "phone/WhatsApp must be a valid contact number" };
  }
  if (!payload.city) return { error: "city/location is required" };
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
      "POST /orders",
      "GET /orders (admin token required)",
      "PATCH /orders/:id (admin token required)",
      "PATCH /orders/:id/status (admin token required, status only)",
      "POST /products (admin token required)",
      "PUT /products/:id (admin token required)",
      "PATCH /products/:id/stock (admin token required)",
      "DELETE /products/:id (admin token required)",
    ],
  });
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

app.post("/orders", async (req, res) => {
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

app.patch("/orders/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const status = req.body.status?.toString().trim();
    const validation = validateOrderStatus(status);
    if (validation.error) return res.status(400).json({ error: validation.error });

    const result = await pool.query(
      `UPDATE orders
       SET status = $1
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );

    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update order status:", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.patch("/orders/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { payload, error } = validateOrderAdminUpdatePayload(req.body || {});
    if (error) return res.status(400).json({ error });

    const fields = [];
    const values = [];
    Object.entries(payload).forEach(([key, value]) => {
      values.push(value);
      fields.push(`${key} = $${values.length}`);
    });
    values.push(id);

    const result = await pool.query(
      `UPDATE orders
       SET ${fields.join(", ")}
       WHERE id = $${values.length}
       RETURNING *`,
      values
    );

    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Failed to update order:", error.message);
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
        slug, name, description, material, color, style, chain_length_cm, price, stock, featured, image_url, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
           style = $6,
           chain_length_cm = $7,
           price = $8,
           stock = $9,
           featured = $10,
           image_url = $11,
           status = $12
       WHERE id = $13
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
  ensureDatabaseSchema()
    .then(() => {
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Failed to prepare database schema:", error);
      process.exit(1);
    });
}

module.exports = {
  app,
  validateProductPayload,
  buildProductVisibilityWhere,
  productSortClause,
  validateOrderRequestPayload,
  validateOrderStatus,
  validateOrderAdminUpdatePayload,
  allowedOrderStatuses,
};
