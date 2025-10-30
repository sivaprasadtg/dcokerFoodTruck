-- DB set up for Order service
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  customer_id TEXT NULL,
  items JSONB NOT NULL,
  payment_method TEXT NOT NULL,
  total NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update 'updated_at' on any change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_order_timestamp ON orders;
CREATE TRIGGER update_order_timestamp
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();


-- DB set up for Menu service
CREATE TABLE IF NOT EXISTS menu (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_menu_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_menu_timestamp ON menu;
CREATE TRIGGER update_menu_timestamp
BEFORE UPDATE ON menu
FOR EACH ROW
EXECUTE FUNCTION update_menu_timestamp();

-- DB set up for per-day order counter (for IDs like YYYYMMDD-0001)
CREATE TABLE IF NOT EXISTS order_counters (
  day_key TEXT PRIMARY KEY,
  last_value INTEGER NOT NULL DEFAULT 0
);
