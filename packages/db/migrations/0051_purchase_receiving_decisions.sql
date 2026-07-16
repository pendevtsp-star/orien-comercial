ALTER TABLE purchase_fiscal_document_items
  ADD COLUMN IF NOT EXISTS apply_cost boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apply_sale_price boolean NOT NULL DEFAULT false;

INSERT INTO release_notes(version, title, summary, changes, audience_roles)
VALUES (
  '1.19.0',
  'Recebimento de compras com decisões de preço',
  'A conferência de NF-e passa a exigir decisão explícita antes de atualizar custo ou preço de venda de produtos já cadastrados.',
  ARRAY[
    'Comparação do custo e preço atual do cadastro com os valores da nota.',
    'Atualização opcional de custo e preço por item, registrada na auditoria.',
    'Entrada de estoque e contas a pagar continuam vinculadas à NF-e e ao fornecedor.'
  ],
  ARRAY['owner','admin','manager','stock','finance']
)
ON CONFLICT (version) DO NOTHING;
