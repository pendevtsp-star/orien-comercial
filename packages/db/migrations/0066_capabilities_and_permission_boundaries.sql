INSERT INTO permissions (slug, description)
VALUES
  ('cash.read', 'cash read'),
  ('cash.open', 'cash open'),
  ('cash.close', 'cash close'),
  ('cash.manage', 'cash manage'),
  ('purchases.read', 'purchases read'),
  ('purchases.manage', 'purchases manage'),
  ('returns.read', 'returns read'),
  ('returns.create', 'returns create'),
  ('services.read', 'services read'),
  ('services.manage', 'services manage'),
  ('service_orders.read', 'service orders read'),
  ('service_orders.manage', 'service orders manage'),
  ('integrations.read', 'integrations read'),
  ('integrations.manage', 'integrations manage'),
  ('pipeline.read', 'pipeline read'),
  ('pipeline.manage', 'pipeline manage')
ON CONFLICT (slug) DO UPDATE SET description = EXCLUDED.description;

-- Platform permissions belong to platform_admins, never to tenant roles.
DELETE FROM role_permissions rp
USING permissions p, roles r
WHERE rp.permission_id = p.id
  AND rp.role_id = r.id
  AND r.tenant_id IS NOT NULL
  AND p.slug LIKE 'platform.%';

WITH grants(role_slug, permission_slug) AS (
  VALUES
    ('owner', 'cash.read'), ('owner', 'cash.open'), ('owner', 'cash.close'), ('owner', 'cash.manage'),
    ('owner', 'purchases.read'), ('owner', 'purchases.manage'), ('owner', 'returns.read'), ('owner', 'returns.create'),
    ('owner', 'services.read'), ('owner', 'services.manage'), ('owner', 'service_orders.read'), ('owner', 'service_orders.manage'),
    ('owner', 'integrations.read'), ('owner', 'integrations.manage'), ('owner', 'pipeline.read'), ('owner', 'pipeline.manage'),
    ('admin', 'cash.read'), ('admin', 'cash.open'), ('admin', 'cash.close'), ('admin', 'cash.manage'),
    ('admin', 'purchases.read'), ('admin', 'purchases.manage'), ('admin', 'returns.read'), ('admin', 'returns.create'),
    ('admin', 'services.read'), ('admin', 'services.manage'), ('admin', 'service_orders.read'), ('admin', 'service_orders.manage'),
    ('admin', 'integrations.read'), ('admin', 'integrations.manage'), ('admin', 'pipeline.read'), ('admin', 'pipeline.manage'),
    ('manager', 'cash.read'), ('manager', 'cash.open'), ('manager', 'cash.close'),
    ('manager', 'purchases.read'), ('manager', 'purchases.manage'), ('manager', 'returns.read'), ('manager', 'returns.create'),
    ('manager', 'services.read'), ('manager', 'services.manage'), ('manager', 'service_orders.read'), ('manager', 'service_orders.manage'),
    ('manager', 'integrations.read'), ('manager', 'pipeline.read'), ('manager', 'pipeline.manage'),
    ('seller', 'returns.read'), ('seller', 'returns.create'), ('seller', 'services.read'),
    ('seller', 'service_orders.read'), ('seller', 'service_orders.manage'), ('seller', 'pipeline.read'), ('seller', 'pipeline.manage'),
    ('cashier', 'cash.read'), ('cashier', 'cash.open'), ('cashier', 'cash.close'), ('cashier', 'returns.read'), ('cashier', 'returns.create'),
    ('stock', 'purchases.read'), ('stock', 'purchases.manage'),
    ('finance', 'cash.read'), ('finance', 'purchases.read'), ('finance', 'returns.read')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM grants g
JOIN roles r ON r.slug = g.role_slug AND r.tenant_id IS NOT NULL
JOIN permissions p ON p.slug = g.permission_slug
ON CONFLICT DO NOTHING;

WITH plan_capabilities(plan_slug, capability_key) AS (
  VALUES
    ('starter', 'cash'), ('starter', 'purchases'), ('starter', 'returns'),
    ('pro', 'cash'), ('pro', 'purchases'), ('pro', 'returns'), ('pro', 'services'),
    ('pro', 'service_orders'), ('pro', 'integrations'), ('pro', 'pipeline'),
    ('enterprise', 'cash'), ('enterprise', 'purchases'), ('enterprise', 'returns'),
    ('enterprise', 'services'), ('enterprise', 'service_orders'), ('enterprise', 'integrations'), ('enterprise', 'pipeline')
)
INSERT INTO plan_features (plan_id, key, value)
SELECT p.id, pc.capability_key, '{"enabled": true}'::jsonb
FROM plan_capabilities pc
JOIN plans p ON p.slug = pc.plan_slug
ON CONFLICT (plan_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
