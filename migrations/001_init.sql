-- Migration 001 - Init Schema
-- Create products table with all fields and check constraints
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT NOT NULL,
  color_options TEXT,
  style TEXT NOT NULL,
  image_url TEXT,
  image_urls TEXT[],
  chain_length_cm INTEGER NOT NULL CHECK (chain_length_cm > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'sold_out')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Keep this init migration safe for existing databases that were created
-- before the newer inventory/gallery columns existed. CREATE TABLE IF NOT
-- EXISTS does not add missing columns to an existing table, so the app still
-- needs column-level migrations before seed data or runtime queries touch
-- those fields.
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_options TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
UPDATE products
SET status = 'active'
WHERE status IS NULL OR status = '';
UPDATE products
SET image_urls = ARRAY[image_url]
WHERE (image_urls IS NULL OR array_length(image_urls, 1) IS NULL)
  AND image_url IS NOT NULL
  AND image_url <> '';

-- Create orders table with all fields and check constraints
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
);

-- Existing order tables may predate the admin follow-up workflow.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
UPDATE orders
SET priority = 'normal'
WHERE priority IS NULL OR priority = '';

-- Create order items table
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
);

-- Create site content table
CREATE TABLE IF NOT EXISTS site_content (
  key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  section TEXT NOT NULL,
  value TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'text',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
