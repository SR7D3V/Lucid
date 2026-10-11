-- Read-only surface for the admin SQL console.
--
-- The console connects as a separate, unprivileged login role (see scripts/setup-console-role.ts)
-- that can only read the views below. Views run with their owner's rights, so the role never needs
-- access to the underlying tables, and secrets (password hashes, session tokens, rate-limit state,
-- the audit log) are simply not exposed.

CREATE SCHEMA console;

CREATE VIEW console.stores AS
  SELECT store_id, name, location, contact, created_at FROM public.stores;

CREATE VIEW console.categories AS
  SELECT category_id, slug, name, has_sizes, sort_order FROM public.categories;

CREATE VIEW console.subcategories AS
  SELECT subcategory_id, category_id, slug, name, sort_order FROM public.subcategories;

CREATE VIEW console.products AS
  SELECT product_id, subcategory_id, name, description, price, image_id, is_active, created_at, updated_at
  FROM public.products;

CREATE VIEW console.product_images AS
  SELECT image_id, content_type, byte_size, sha256, created_at FROM public.product_images;

CREATE VIEW console.product_catalog AS
  SELECT product_id, name, description, price, image_id, is_active, created_at,
         category_id, category_slug, category_name, has_sizes,
         subcategory_id, subcategory_slug, subcategory_name, total_stock, default_store_id
  FROM public.product_catalog;

CREATE VIEW console.inventory AS
  SELECT store_id, product_id, quantity, updated_at FROM public.inventory;

CREATE VIEW console.inventory_movements AS
  SELECT movement_id, store_id, product_id, delta, quantity_after, reason, order_id, created_at
  FROM public.inventory_movements;

CREATE VIEW console.customers AS
  SELECT customer_id, name, email, phone, role, created_at, updated_at FROM public.customers;

CREATE VIEW console.carts AS
  SELECT cart_id, customer_id, created_at, updated_at FROM public.carts;

CREATE VIEW console.cart_items AS
  SELECT cart_item_id, cart_id, store_id, product_id, size, quantity, added_at FROM public.cart_items;

CREATE VIEW console.wishlist_items AS
  SELECT customer_id, product_id, added_at FROM public.wishlist_items;

CREATE VIEW console.orders AS
  SELECT order_id, customer_id, store_id, checkout_id, status, total_amount, placed_at, updated_at
  FROM public.orders;

CREATE VIEW console.order_items AS
  SELECT order_item_id, order_id, product_id, size, quantity, unit_price FROM public.order_items;

-- The audit trail is append-only: rows can be added but never edited or removed.
CREATE FUNCTION forbid_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_log is append-only';
END $$;

CREATE TRIGGER admin_audit_log_append_only BEFORE UPDATE OR DELETE ON admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();
