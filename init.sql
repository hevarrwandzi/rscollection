CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  material TEXT NOT NULL,
  color TEXT NOT NULL,
  style TEXT NOT NULL,
  chain_length_cm INTEGER NOT NULL CHECK (chain_length_cm > 0),
  price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  featured BOOLEAN NOT NULL DEFAULT FALSE,
  image_url TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products (slug, name, description, material, color, style, chain_length_cm, price, stock, featured, image_url)
VALUES
  ('crown-charm-chain', 'Crown Charm Chain', 'Multi-charm necklace with colored beads, crown detail, and a playful anime accessory feel.', 'Alloy chain, mixed charms, beads', 'Silver / multicolor', 'Charm chain', 45, 18.00, 10, TRUE, '/assets/products/charm-chain.png'),
  ('silver-wolf-pendant', 'Silver Wolf Pendant', 'Sharp silver pendant with fantasy crest energy for dark outfits and collector styling.', 'Alloy pendant, steel chain', 'Silver', 'Pendant', 50, 14.00, 12, TRUE, '/assets/products/sword-pendant.png'),
  ('skeleton-key-necklace', 'Skeleton Key Necklace', 'Clean silver key pendant for anime-inspired outfits, daily wear, or gifting.', 'Alloy key pendant, steel chain', 'Silver', 'Key pendant', 50, 12.00, 15, TRUE, '/assets/products/key-pendant.png'),
  ('dragon-blade-pendant', 'Dragon Blade Pendant', 'Long blade-shaped pendant with detailed silver finish and dark fantasy energy.', 'Alloy pendant, steel chain', 'Silver', 'Blade pendant', 55, 16.00, 8, TRUE, '/assets/products/dragon-blade-pendant.png'),
  ('ornate-key-pendant', 'Ornate Key Pendant', 'Decorative gothic key pendant with a clean silver finish and premium accessory look.', 'Alloy key pendant, steel chain', 'Silver', 'Key pendant', 50, 13.00, 9, FALSE, '/assets/products/ornate-key-pendant.png')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  material = EXCLUDED.material,
  color = EXCLUDED.color,
  style = EXCLUDED.style,
  chain_length_cm = EXCLUDED.chain_length_cm,
  price = EXCLUDED.price,
  stock = EXCLUDED.stock,
  featured = EXCLUDED.featured,
  image_url = EXCLUDED.image_url;
