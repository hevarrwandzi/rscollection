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
  ('crystal-guardian-pendant', 'Crystal Guardian Pendant', 'Fantasy pendant with a sapphire crystal core and wing-shaped frame, designed for RPG collectors and cosplay outfits.', 'Stainless steel, crystal glass', 'Silver / Sapphire', 'Crystal', 45, 89.00, 12, TRUE, 'https://images.unsplash.com/photo-1602173574767-37ac01994b2a?auto=format&fit=crop&w=1000&q=80'),
  ('heartbound-key-necklace', 'Heartbound Key Necklace', 'A polished key-charm necklace with heart and crown details for fans of magical kingdom aesthetics.', 'Gold-plated alloy', 'Gold / Ruby', 'Key Charm', 50, 74.50, 9, TRUE, 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&w=1000&q=80'),
  ('moonblade-chain', 'Moonblade Chain', 'Dark silver crescent pendant with blade-like edges for gothic fantasy outfits and night-market styling.', 'Blackened stainless steel', 'Gunmetal / Moonstone', 'Gothic', 48, 58.00, 15, FALSE, 'https://images.unsplash.com/photo-1617038260897-41a1f14a8ca0?auto=format&fit=crop&w=1000&q=80'),
  ('summoner-star-charm', 'Summoner Star Charm', 'Celestial star charm with a tiny crystal drop, made for soft fantasy looks and everyday accessory sets.', 'Sterling silver, cubic zirconia', 'Silver / Clear', 'Celestial', 42, 64.00, 6, TRUE, 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=1000&q=80'),
  ('royal-crown-relic', 'Royal Crown Relic', 'Small crown pendant with violet stone detail, a clean statement piece for fantasy formalwear.', 'Gold-plated brass, violet crystal', 'Gold / Violet', 'Royal', 46, 96.00, 3, TRUE, 'https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?auto=format&fit=crop&w=1000&q=80'),
  ('silver-wing-token', 'Silver Wing Token', 'Minimal wing pendant for casual outfits, convention gifts, and RPG-inspired accessory bundles.', 'Stainless steel', 'Silver', 'Pendant', 44, 42.00, 18, FALSE, 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1000&q=80')
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
// health check
pg_isready -h db -p 5432 -U postgres