-- LUCID retail schema (PostgreSQL 14+)
-- Normalised to 3NF; see docs/database.md for the design rationale.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE customer_role AS ENUM ('customer', 'admin');
CREATE TYPE order_status AS ENUM ('confirmed', 'shipped', 'delivered', 'cancelled');
CREATE TYPE inventory_reason AS ENUM ('restock', 'adjustment', 'sale', 'cancellation', 'sql_console');
CREATE DOMAIN garment_size AS text CHECK (VALUE IN ('XS', 'S', 'M', 'L', 'XL', 'One Size'));

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------

CREATE TABLE stores (
  store_id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  location   text NOT NULL CHECK (length(btrim(location)) BETWEEN 1 AND 120),
  contact    text CHECK (length(contact) <= 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX stores_name_location_key ON stores (lower(name), lower(location));

CREATE TABLE categories (
  category_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug        text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name        text NOT NULL,
  has_sizes   boolean NOT NULL DEFAULT true,
  sort_order  smallint NOT NULL DEFAULT 0
);

CREATE TABLE subcategories (
  subcategory_id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id    smallint NOT NULL REFERENCES categories ON DELETE CASCADE,
  slug           text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text NOT NULL,
  sort_order     smallint NOT NULL DEFAULT 0,
  UNIQUE (category_id, slug)
);

-- Images live in the database so the app has no filesystem state and deploys anywhere.
CREATE TABLE product_images (
  image_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type text NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  data         bytea NOT NULL,
  sha256       text NOT NULL UNIQUE,
  byte_size    integer GENERATED ALWAYS AS (octet_length(data)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  product_id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subcategory_id smallint NOT NULL REFERENCES subcategories,
  name           text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  description    text CHECK (length(description) <= 2000),
  price          numeric(10, 2) NOT NULL CHECK (price > 0),
  image_id       uuid REFERENCES product_images ON DELETE SET NULL,
  -- Products are archived rather than deleted so order history stays intact.
  is_active      boolean NOT NULL DEFAULT true,
  search_vector  tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', name), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_subcategory_idx ON products (subcategory_id) WHERE is_active;
CREATE INDEX products_created_idx ON products (created_at DESC) WHERE is_active;
CREATE INDEX products_search_idx ON products USING gin (search_vector);
CREATE INDEX products_name_trgm_idx ON products USING gin (name gin_trgm_ops);
CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

CREATE TABLE inventory (
  store_id   integer NOT NULL REFERENCES stores ON DELETE CASCADE,
  product_id integer NOT NULL REFERENCES products ON DELETE CASCADE,
  quantity   integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (store_id, product_id)
);
CREATE INDEX inventory_product_idx ON inventory (product_id);
CREATE TRIGGER inventory_updated_at BEFORE UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only ledger of every stock change, written by trigger so that changes made
-- from anywhere (checkout, admin, SQL console) are captured.
CREATE TABLE inventory_movements (
  movement_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id       integer NOT NULL REFERENCES stores ON DELETE CASCADE,
  product_id     integer NOT NULL REFERENCES products ON DELETE CASCADE,
  delta          integer NOT NULL CHECK (delta <> 0),
  quantity_after integer NOT NULL,
  reason         inventory_reason NOT NULL,
  order_id       integer,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_item_idx ON inventory_movements (store_id, product_id, created_at DESC);

CREATE FUNCTION log_inventory_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  change integer := NEW.quantity - CASE WHEN TG_OP = 'INSERT' THEN 0 ELSE OLD.quantity END;
BEGIN
  IF change <> 0 THEN
    INSERT INTO inventory_movements (store_id, product_id, delta, quantity_after, reason, order_id)
    VALUES (
      NEW.store_id,
      NEW.product_id,
      change,
      NEW.quantity,
      coalesce(nullif(current_setting('lucid.inventory_reason', true), '')::inventory_reason, 'adjustment'),
      nullif(current_setting('lucid.order_id', true), '')::integer
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER inventory_movement_log AFTER INSERT OR UPDATE OF quantity ON inventory
  FOR EACH ROW EXECUTE FUNCTION log_inventory_movement();

-- ---------------------------------------------------------------------------
-- Customers & sessions
-- ---------------------------------------------------------------------------

CREATE TABLE customers (
  customer_id   integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  email         text NOT NULL UNIQUE CHECK (email = lower(email) AND email LIKE '_%@_%'),
  phone         text CHECK (length(phone) <= 40),
  password_hash text NOT NULL,
  role          customer_role NOT NULL DEFAULT 'customer',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Only a SHA-256 of the session token is stored; the raw token lives in an httpOnly cookie.
CREATE TABLE sessions (
  token_hash  bytea PRIMARY KEY,
  customer_id integer NOT NULL REFERENCES customers ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX sessions_customer_idx ON sessions (customer_id);
CREATE INDEX sessions_expires_idx ON sessions (expires_at);

-- ---------------------------------------------------------------------------
-- Shopping bag & wishlist
-- ---------------------------------------------------------------------------

-- A cart belongs to a customer, or to a guest (customer_id NULL) identified by a cookie.
CREATE TABLE carts (
  cart_id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id integer UNIQUE REFERENCES customers ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX carts_guest_updated_idx ON carts (updated_at) WHERE customer_id IS NULL;
CREATE TRIGGER carts_updated_at BEFORE UPDATE ON carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cart_items (
  cart_item_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cart_id      uuid NOT NULL REFERENCES carts ON DELETE CASCADE,
  store_id     integer NOT NULL,
  product_id   integer NOT NULL,
  size         garment_size NOT NULL,
  quantity     integer NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  added_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, store_id, product_id, size),
  -- An item can only be bagged from a store that stocks it.
  FOREIGN KEY (store_id, product_id) REFERENCES inventory ON DELETE CASCADE
);

CREATE TABLE wishlist_items (
  customer_id integer NOT NULL REFERENCES customers ON DELETE CASCADE,
  product_id  integer NOT NULL REFERENCES products ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------

-- One checkout produces one order per fulfilling store. checkout_id is the client's
-- idempotency key, so retried submissions never create duplicate orders.
CREATE TABLE orders (
  order_id     integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id  integer NOT NULL REFERENCES customers ON DELETE RESTRICT,
  store_id     integer NOT NULL REFERENCES stores ON DELETE RESTRICT,
  checkout_id  uuid NOT NULL,
  status       order_status NOT NULL DEFAULT 'confirmed',
  total_amount numeric(12, 2) NOT NULL CHECK (total_amount >= 0),
  placed_at    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (customer_id, checkout_id, store_id)
);
CREATE INDEX orders_customer_idx ON orders (customer_id, placed_at DESC);
CREATE INDEX orders_status_idx ON orders (status, placed_at DESC);
CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_order_fk FOREIGN KEY (order_id) REFERENCES orders ON DELETE SET NULL;

-- unit_price is captured at purchase time so later price changes never rewrite history.
CREATE TABLE order_items (
  order_item_id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id      integer NOT NULL REFERENCES orders ON DELETE CASCADE,
  product_id    integer NOT NULL REFERENCES products ON DELETE RESTRICT,
  size          garment_size NOT NULL,
  quantity      integer NOT NULL CHECK (quantity > 0),
  unit_price    numeric(10, 2) NOT NULL CHECK (unit_price >= 0),
  UNIQUE (order_id, product_id, size)
);
CREATE INDEX order_items_product_idx ON order_items (product_id);

-- ---------------------------------------------------------------------------
-- Operations
-- ---------------------------------------------------------------------------

CREATE TABLE admin_audit_log (
  audit_id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id integer REFERENCES customers ON DELETE SET NULL,
  action      text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log (created_at DESC);

-- Fixed-window rate limiting shared across app instances. UNLOGGED: losing it on crash is fine.
CREATE UNLOGGED TABLE rate_limits (
  bucket            text PRIMARY KEY,
  hits              integer NOT NULL,
  window_started_at timestamptz NOT NULL
);

-- ---------------------------------------------------------------------------
-- Read model
-- ---------------------------------------------------------------------------

CREATE VIEW product_catalog AS
SELECT
  p.product_id,
  p.name,
  p.description,
  p.price,
  p.image_id,
  p.is_active,
  p.created_at,
  p.search_vector,
  c.category_id,
  c.slug AS category_slug,
  c.name AS category_name,
  c.has_sizes,
  s.subcategory_id,
  s.slug AS subcategory_slug,
  s.name AS subcategory_name,
  coalesce(stock.total_stock, 0) AS total_stock,
  stock.default_store_id
FROM products p
JOIN subcategories s ON s.subcategory_id = p.subcategory_id
JOIN categories c ON c.category_id = s.category_id
LEFT JOIN LATERAL (
  SELECT
    sum(i.quantity)::integer AS total_stock,
    (array_agg(i.store_id ORDER BY i.quantity DESC, i.store_id) FILTER (WHERE i.quantity > 0))[1] AS default_store_id
  FROM inventory i
  WHERE i.product_id = p.product_id
) stock ON true;
