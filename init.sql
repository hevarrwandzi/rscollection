CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT NOT NULL,
  color_options TEXT,
  style TEXT NOT NULL,
  image_urls TEXT[],
  chain_length_cm INTEGER NOT NULL CHECK (chain_length_cm > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived', 'sold_out')),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE products ADD COLUMN IF NOT EXISTS color_options TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls TEXT[];
UPDATE products SET status = 'active' WHERE status IS NULL OR status = '';
UPDATE products SET image_urls = ARRAY[image_url] WHERE (image_urls IS NULL OR array_length(image_urls, 1) IS NULL) AND image_url IS NOT NULL AND image_url <> '';

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

ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';
UPDATE orders SET priority = 'normal' WHERE priority IS NULL OR priority = '';

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0)
);

INSERT INTO products (slug, name, description, material, color, color_options, style, chain_length_cm, price, stock, featured, image_url, image_urls, status)
VALUES
  ('crown-charm-chain', 'Crown Charm Chain', 'Multi-charm necklace with colored beads, crown detail, and a playful anime accessory feel.', 'Alloy chain, mixed charms, beads', 'Silver / multicolor', 'Silver / multicolor', 'Charm chain', 45, 18.00, 10, TRUE, '/assets/products/charm-chain.png', ARRAY['/assets/products/charm-chain.png'], 'active'),
  ('silver-wolf-pendant', 'Silver Wolf Pendant', 'Sharp silver pendant with fantasy crest energy for dark outfits and collector styling.', 'Alloy pendant, steel chain', 'Silver', 'Silver', 'Pendant', 50, 14.00, 12, TRUE, '/assets/products/sword-pendant.png', ARRAY['/assets/products/sword-pendant.png'], 'active'),
  ('skeleton-key-necklace', 'Skeleton Key Necklace', 'Clean silver key pendant for anime-inspired outfits, daily wear, or gifting.', 'Alloy key pendant, steel chain', 'Silver', 'Silver', 'Key pendant', 50, 12.00, 15, TRUE, '/assets/products/key-pendant.png', ARRAY['/assets/products/key-pendant.png'], 'active'),
  ('dragon-blade-pendant', 'Dragon Blade Pendant', 'Long blade-shaped pendant with detailed silver finish and dark fantasy energy.', 'Alloy pendant, steel chain', 'Silver', 'Silver', 'Blade pendant', 55, 16.00, 8, TRUE, '/assets/products/dragon-blade-pendant.png', ARRAY['/assets/products/dragon-blade-pendant.png'], 'active'),
  ('ornate-key-pendant', 'Ornate Key Pendant', 'Decorative gothic key pendant with a clean silver finish and premium accessory look.', 'Alloy key pendant, steel chain', 'Silver', 'Silver', 'Key pendant', 50, 13.00, 9, FALSE, '/assets/products/ornate-key-pendant.png', ARRAY['/assets/products/ornate-key-pendant.png'], 'active')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  material = EXCLUDED.material,
  color = EXCLUDED.color,
  color_options = EXCLUDED.color_options,
  style = EXCLUDED.style,
  chain_length_cm = EXCLUDED.chain_length_cm,
  price = EXCLUDED.price,
  stock = EXCLUDED.stock,
  featured = EXCLUDED.featured,
  image_url = EXCLUDED.image_url,
  image_urls = EXCLUDED.image_urls,
  status = EXCLUDED.status;
