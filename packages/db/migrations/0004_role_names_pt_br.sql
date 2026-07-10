UPDATE roles
SET name = CASE slug
  WHEN 'owner' THEN 'Proprietario'
  WHEN 'admin' THEN 'Administrador'
  WHEN 'manager' THEN 'Gerente'
  WHEN 'seller' THEN 'Vendedor'
  WHEN 'cashier' THEN 'Caixa'
  WHEN 'stock' THEN 'Estoquista'
  WHEN 'finance' THEN 'Financeiro'
  WHEN 'support' THEN 'Suporte'
  WHEN 'viewer' THEN 'Consulta'
  ELSE name
END,
updated_at = now()
WHERE slug IN ('owner', 'admin', 'manager', 'seller', 'cashier', 'stock', 'finance', 'support', 'viewer');
