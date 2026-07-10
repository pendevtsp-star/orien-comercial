INSERT INTO permissions (slug, description)
VALUES
  ('stock.read', 'stock read'),
  ('stock.adjust', 'stock adjust'),
  ('stock.transfer', 'stock transfer'),
  ('sales.read', 'sales read'),
  ('sales.create', 'sales create'),
  ('sales.cancel', 'sales cancel'),
  ('financial.read', 'financial read'),
  ('financial.receive', 'financial receive'),
  ('financial.pay', 'financial pay')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;

WITH grants(role_slug, permission_slug) AS (
  VALUES
    ('owner', 'stock.read'),
    ('owner', 'stock.adjust'),
    ('owner', 'stock.transfer'),
    ('owner', 'sales.read'),
    ('owner', 'sales.create'),
    ('owner', 'sales.cancel'),
    ('owner', 'financial.read'),
    ('owner', 'financial.receive'),
    ('owner', 'financial.pay'),
    ('admin', 'stock.read'),
    ('admin', 'stock.adjust'),
    ('admin', 'sales.read'),
    ('admin', 'sales.create'),
    ('admin', 'financial.read'),
    ('manager', 'stock.read'),
    ('manager', 'stock.adjust'),
    ('manager', 'sales.read'),
    ('manager', 'sales.create'),
    ('manager', 'financial.read'),
    ('seller', 'sales.read'),
    ('seller', 'sales.create'),
    ('cashier', 'sales.read'),
    ('cashier', 'sales.create'),
    ('stock', 'stock.read'),
    ('stock', 'stock.adjust'),
    ('stock', 'stock.transfer'),
    ('finance', 'sales.read'),
    ('finance', 'financial.read'),
    ('finance', 'financial.receive'),
    ('finance', 'financial.pay')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r ON r.slug = g.role_slug
JOIN permissions p ON p.slug = g.permission_slug
ON CONFLICT DO NOTHING;
