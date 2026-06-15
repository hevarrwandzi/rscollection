-- Migration 002 - Seed Default Content and Products
-- Seed products
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

-- Seed default site content
INSERT INTO site_content (key, label, section, value, input_type)
VALUES
  ('theme.default', 'Default theme', 'Theme', 'dark', 'theme'),
  ('hero.eyebrow', 'Hero eyebrow', 'Hero', 'Accessory shop story mode', 'text'),
  ('hero.title', 'Hero title', 'Hero', 'Your style needs a main character arc.', 'text'),
  ('hero.subtitle', 'Hero subtitle', 'Hero', 'Browse the drop, pick your item, then message RSCollection on WhatsApp or Instagram. Real photos, clear stock, simple ordering.', 'textarea'),
  ('hero.primary_cta', 'Hero primary button', 'Hero', 'Shop the drop', 'text'),
  ('hero.secondary_cta', 'Hero secondary button', 'Hero', 'See featured picks', 'text'),
  ('catalog.title', 'Catalog title', 'Catalog', 'Shop the drop', 'text'),
  ('catalog.subtitle', 'Catalog subtitle', 'Catalog', 'Search by product name, material, or style. Filter by accessory type and price.', 'textarea'),
  ('featured.title', 'Featured title', 'Featured', 'New drops & best picks', 'text'),
  ('contact.title', 'Contact title', 'Contact', 'Ready to buy from RSCollection?', 'text'),
  ('contact.subtitle', 'Contact subtitle', 'Contact', 'Add products to your order list, then send a prepared message through WhatsApp or Instagram. Simple, direct, and customer-friendly.', 'textarea'),
  ('footer.description', 'Footer description', 'Footer', 'Dark accessory drops, necklaces, pendants, charms, and fan-friendly pieces.', 'textarea')
ON CONFLICT (key) DO NOTHING;
