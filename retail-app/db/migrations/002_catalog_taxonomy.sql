-- Reference data: the storefront navigation taxonomy.

INSERT INTO categories (slug, name, has_sizes, sort_order) VALUES
  ('ladies', 'Ladies', true, 1),
  ('men', 'Men', true, 2),
  ('kids', 'Kids', true, 3),
  ('home', 'Home', false, 4),
  ('beauty', 'Beauty', false, 5);

INSERT INTO subcategories (category_id, slug, name, sort_order)
SELECT c.category_id, v.slug, v.name, v.sort_order
FROM (VALUES
  ('ladies', 'new-arrivals', 'New Arrivals', 1),
  ('ladies', 'tops', 'Tops', 2),
  ('ladies', 'dresses', 'Dresses', 3),
  ('ladies', 'activewear', 'Activewear', 4),
  ('men', 'new-arrivals', 'New Arrivals', 1),
  ('men', 'shirts', 'Shirts', 2),
  ('men', 'jeans', 'Jeans', 3),
  ('men', 'suits', 'Suits', 4),
  ('kids', 'baby', 'Baby', 1),
  ('kids', 'boys', 'Boys', 2),
  ('kids', 'girls', 'Girls', 3),
  ('kids', 'shoes', 'Shoes', 4),
  ('home', 'decor', 'Decor', 1),
  ('home', 'bedding', 'Bedding', 2),
  ('home', 'living', 'Living', 3),
  ('home', 'kitchen', 'Kitchen', 4),
  ('beauty', 'makeup', 'Makeup', 1),
  ('beauty', 'skincare', 'Skincare', 2),
  ('beauty', 'fragrance', 'Fragrance', 3)
) AS v (category_slug, slug, name, sort_order)
JOIN categories c ON c.slug = v.category_slug;
